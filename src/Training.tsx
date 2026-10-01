import { useEffect, useRef, useState } from "react";
import {
  CALLS,
  addInclusion,
  inclusionsFor,
  isKnownPhrase,
  parseUtterance,
  trainingIssues,
  trainingReport,
  trainingRows,
  fullTrainingPhrases,
  normalizeUtterance,
} from "./parse";

type Attempt = {
  id: string;
  expectedLabel: string;
  expectedType: string;
  raw: string;
  alternatives: string[];
  parsedLabel: string | null;
  parsedType: string | null;
  at: number;
};

const LOG_KEY = "ncaaf-audio-training";
const REJECT_KEY = "ncaaf-audio-training-rejected";

const SPEECH_ERRORS: Record<string, string> = {
  network: "This browser has no speech service. Open the page in Chrome or Safari.",
  "not-allowed": "Allow the microphone to record a call.",
  "service-not-allowed": "Speech recognition is blocked in this browser.",
  "audio-capture": "No microphone was found.",
};

function loadAttempts(): Attempt[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Attempt[];
    if (!Array.isArray(parsed)) return [];
    const expanded = parsed.flatMap((attempt) =>
      trainingIssues(attempt.raw).map((phrase, index) => ({
        ...attempt,
        id: trainingIssues(attempt.raw).length === 1 ? attempt.id : `${attempt.id}-${index}`,
        raw: phrase,
        alternatives: [],
      })),
    );
    return keepFullAttempts(expanded);
  } catch {
    return [];
  }
}

function loadRejected(): string[] {
  try {
    const raw = localStorage.getItem(REJECT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function issueKey(label: string, phrase: string): string {
  return `${label}:${phrase}`;
}

function keepFullAttempts(attempts: Attempt[]): Attempt[] {
  const phrasesByLabel = new Map<string, string[]>();
  for (const attempt of attempts) {
    const list = phrasesByLabel.get(attempt.expectedLabel) ?? [];
    list.push(attempt.raw);
    phrasesByLabel.set(attempt.expectedLabel, list);
  }
  const allowed = new Map<string, Set<string>>();
  for (const [label, phrases] of phrasesByLabel) {
    allowed.set(label, new Set(fullTrainingPhrases(phrases)));
  }
  const seen = new Set<string>();
  return attempts.flatMap((attempt) => {
    const phrase = normalizeUtterance(attempt.raw);
    const key = issueKey(attempt.expectedLabel, phrase);
    if (!phrase || seen.has(key) || !allowed.get(attempt.expectedLabel)?.has(phrase)) return [];
    seen.add(key);
    return [{ ...attempt, raw: phrase }];
  });
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function Training({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [raw, setRaw] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>(loadAttempts);
  const [rejected, setRejected] = useState<string[]>(loadRejected);
  const [error, setError] = useState<string | null>(null);
  const [included, setIncluded] = useState<string[]>(() => inclusionsFor(CALLS[0].label));
  const [view, setView] = useState<"run" | "results">("run");
  const [notice, setNotice] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState(CALLS[0].label);

  const call = CALLS[index];
  const visibleAttempts =
    logFilter === "all" ? attempts : attempts.filter((attempt) => attempt.expectedLabel === logFilter);
  const listeningRef = useRef(false);
  const acceptRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const rawRef = useRef("");
  const seenFinalsRef = useRef(0);
  const rejectedRef = useRef(rejected);
  rejectedRef.current = rejected;
  const callRef = useRef(call);
  const stopRef = useRef<() => void>(() => {});
  callRef.current = call;

  const parsed = raw ? parseUtterance(raw).calls : [];
  const matched = parsed.some((item) => item.actionType === call.actionType);
  const wrong = parsed.find((item) => item.actionType !== call.actionType) ?? null;

  useEffect(() => {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(attempts));
    } catch {
      // The on-screen log still stands if storage is blocked.
    }
  }, [attempts]);

  useEffect(() => {
    try {
      localStorage.setItem(REJECT_KEY, JSON.stringify(rejected));
    } catch {
      // Rejected phrases still stay hidden for this session.
    }
  }, [rejected]);

  useEffect(() => {
    return () => {
      stopRef.current();
    };
  }, []);

  function remember(text: string) {
    rawRef.current = text;
    setRaw(text);
  }

  function storeIssues(transcripts: string[]) {
    const currentCall = callRef.current;
    const phrases = fullTrainingPhrases(transcripts);
    if (phrases.length === 0) return;
    setAttempts((current) => {
      const blocked = new Set(rejectedRef.current);
      const added: Attempt[] = [];
      const existing = new Set(current.map((attempt) => issueKey(attempt.expectedLabel, normalizeUtterance(attempt.raw))));
      for (const phrase of phrases) {
        const key = issueKey(currentCall.label, phrase);
        if (existing.has(key) || blocked.has(key) || isKnownPhrase(currentCall.label, phrase)) continue;
        existing.add(key);
        const found = parseUtterance(phrase).calls;
        added.push({
          id: crypto.randomUUID(),
          expectedLabel: currentCall.label,
          expectedType: currentCall.actionType,
          raw: phrase,
          alternatives: [],
          parsedLabel: found[0]?.heard ?? null,
          parsedType: found[0]?.actionType ?? null,
          at: Date.now(),
        });
      }
      return keepFullAttempts([...added, ...current]);
    });
  }

  function stop() {
    listeningRef.current = false;
    acceptRef.current = false;
    setListening(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    storeIssues([rawRef.current]);
    seenFinalsRef.current = 0;
  }
  stopRef.current = stop;

  function start() {
    setError(null);
    const Speech = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Speech) {
      setError("This browser can't hear speech. Open the page in Chrome or Safari.");
      return;
    }
    remember("");
    const recognition = new Speech();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      if (!acceptRef.current) return;
      const latest = event.results[event.results.length - 1];
      remember(latest[0]?.transcript?.trim() ?? "");
      const finals: string[] = [];
      for (let resultIndex = seenFinalsRef.current; resultIndex < event.results.length; resultIndex += 1) {
        const result = event.results[resultIndex];
        if (!result.isFinal) continue;
        seenFinalsRef.current = resultIndex + 1;
        const transcript = result[0]?.transcript?.trim();
        if (transcript) finals.push(transcript);
      }
      storeIssues(finals);
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      setError(SPEECH_ERRORS[event.error] ?? `The recording stopped (${event.error}).`);
      stop();
    };
    recognition.onend = () => {
      storeIssues([rawRef.current]);
      seenFinalsRef.current = 0;
      if (!listeningRef.current) return;
      try {
        recognition.start();
      } catch {
        listeningRef.current = false;
        setListening(false);
      }
    };
    recognitionRef.current = recognition;
    listeningRef.current = true;
    acceptRef.current = true;
    setListening(true);
    try {
      recognition.start();
    } catch {
      stop();
      setError("The recording didn't start. Tap Record to try again.");
    }
  }

  function openResults() {
    if (listeningRef.current) stop();
    setNotice(null);
    setView("results");
  }

  async function copyReport(report: string) {
    try {
      await navigator.clipboard.writeText(report);
      setNotice("Copied. Paste it into a spreadsheet.");
      return;
    } catch {
      // Some mobile browsers block the clipboard API. A selected field still copies.
    }
    const field = document.createElement("textarea");
    field.value = report;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    setNotice(copied ? "Copied. Paste it into a spreadsheet." : "Select the table below and copy it.");
  }

  async function shareReport(report: string) {
    if (typeof navigator.share !== "function") {
      await copyReport(report);
      return;
    }
    try {
      await navigator.share({ title: "NCAAF training", text: report });
      setNotice(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copyReport(report);
    }
  }

  function go(next: number) {
    if (listeningRef.current) stop();
    const bounded = Math.min(CALLS.length - 1, Math.max(0, next));
    const leaving = call.label;
    setIndex(bounded);
    setLogFilter((current) => (current === leaving ? CALLS[bounded].label : current));
    remember("");
    setError(null);
    setIncluded(inclusionsFor(CALLS[bounded].label));
  }

  if (view === "results") {
    const rows = trainingRows(attempts);
    const report = trainingReport(rows);
    const ready = rows.length > 0;
    const canShare = typeof navigator.share === "function";
    return (
      <div className="app">
        <header className="top">
          <div>
            <p className="eyebrow">Training</p>
            <h1>Results</h1>
          </div>
          <button className="text-button" type="button" onClick={() => setView("run")}>
            Back
          </button>
        </header>

        <p className="results-lead">Copy this table and send it back. Each row is one word the recognizer heard.</p>

        <div className={canShare ? "train-nav" : "train-nav is-single"}>
          <button type="button" onClick={() => void copyReport(report)} disabled={!ready}>
            Copy
          </button>
          {canShare && (
            <button type="button" onClick={() => void shareReport(report)} disabled={!ready}>
              Share
            </button>
          )}
        </div>
        {notice && <p className="train-hit">{notice}</p>}
        <div className="results-table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th>word</th>
                <th>heard</th>
                <th>action.type</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3}>No mishears yet.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={`${row.word}:${row.heard}`}>
                    <td>{row.word}</td>
                    <td>{row.heard}</td>
                    <td>{row.actionType}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="eyebrow">Training</p>
          <h1>Say each call</h1>
        </div>
        <div className="top-actions">
          <button className="text-button" type="button" onClick={openResults}>
            Results
          </button>
          <button className="text-button" type="button" onClick={onClose}>
            Back
          </button>
        </div>
      </header>

      <section className="hero" aria-live="polite">
        <p className="hero-kicker">
          {index + 1} of {CALLS.length}
        </p>
        <p className="train-say">Say</p>
        <p className="hero-type">{call.label}</p>
        <p className="hero-heard">{call.actionType === "yardgain" ? "then any number" : call.actionType}</p>
      </section>

      <div className="train-nav">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0}>
          Previous
        </button>
        <button type="button" onClick={() => go(index + 1)} disabled={index === CALLS.length - 1}>
          Next
        </button>
      </div>

      <div className="dock">
        <button className={listening ? "record is-live" : "record"} type="button" onClick={listening ? stop : start}>
          <span className="record-dot" />
          <span>{listening ? "Stop" : "Record"}</span>
        </button>
      </div>

      <section className="panel">
        <h2>Recognizer heard</h2>
        <p className={raw ? "transcript" : "transcript is-empty"}>{raw || "Say the word above, then stop."}</p>
        {raw && (
          <p className={matched ? "train-hit" : "train-miss"}>
            {matched ? `Matched ${call.actionType}` : wrong ? `Saved as ${wrong.actionType}` : "Not a saved call"}
          </p>
        )}
        {included.length > 0 && <p className="unmatched">Inclusions: {included.join(", ")}</p>}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Heard log</h2>
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setAttempts((current) =>
                logFilter === "all" ? [] : current.filter((attempt) => attempt.expectedLabel !== logFilter),
              )
            }
            disabled={visibleAttempts.length === 0}
          >
            Clear
          </button>
        </div>
        <label className="log-filter">
          <span>Show</span>
          <select
            aria-label="Filter heard log by call"
            value={logFilter}
            onChange={(event) => setLogFilter(event.target.value)}
          >
            <option value="all">All calls</option>
            {CALLS.map((item) => {
              const count = attempts.filter((attempt) => attempt.expectedLabel === item.label).length;
              return (
                <option key={item.label} value={item.label}>
                  {item.label}
                  {count > 0 ? ` (${count})` : ""}
                </option>
              );
            })}
          </select>
        </label>
        {visibleAttempts.length === 0 ? (
          <p className="empty">{logFilter === "all" ? "No attempts yet." : `No attempts for ${logFilter} yet.`}</p>
        ) : (
          <ul className="log">
            {visibleAttempts.map((attempt) => (
              <li key={attempt.id}>
                <div>
                  <p className="log-type">{attempt.expectedLabel}</p>
                  <p className="log-meta">
                    “{attempt.raw}”
                    <span>{attempt.parsedType ?? "no call"}</span>
                    <span>{formatTime(attempt.at)}</span>
                  </p>
                </div>
                <div className="log-actions">
                  {!isKnownPhrase(attempt.expectedLabel, attempt.raw) ? (
                    <button
                      type="button"
                      onClick={() => {
                        addInclusion(attempt.expectedLabel, attempt.expectedType, attempt.raw);
                        setAttempts((current) => [...current]);
                        if (attempt.expectedLabel === call.label) setIncluded(inclusionsFor(call.label));
                      }}
                    >
                      Include
                    </button>
                  ) : (
                    <span className="train-hit">Included</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setRejected((current) => [...current, issueKey(attempt.expectedLabel, attempt.raw)]);
                      setAttempts((current) => current.filter((item) => item.id !== attempt.id));
                    }}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

