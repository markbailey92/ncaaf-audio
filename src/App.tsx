import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Training } from "./Training";
import {
  CALLS,
  callGrammar,
  preferredTranscript,
  callsToCommit,
  heardRemainder,
  liveUpdate,
  loadInclusions,
  parseUtterance,
  type CallDefinition,
  type ParsedCall,
  type SavedCall,
} from "./parse";

type LogEntry = {
  id: string;
  heard: string;
  actionType: string;
  at: number;
};

const STORAGE_KEY = "ncaaf-audio-log";

const SPEECH_ERRORS: Record<string, string> = {
  network:
    "This browser has no speech service. Open the page in Chrome or Safari to record, or type a call below.",
  "not-allowed": "Allow the microphone to record a call.",
  "service-not-allowed": "Speech recognition is blocked in this browser. Open the page in Chrome or Safari.",
  "audio-capture": "No microphone was found.",
};

function loadLog(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LogEntry[];
    if (!Array.isArray(parsed)) return [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    sessionStorage.removeItem(STORAGE_KEY);
    return parsed;
  } catch {
    return [];
  }
}

function formatTime(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

export function App() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [liveCalls, setLiveCalls] = useState<ParsedCall[]>([]);
  const [unmatched, setUnmatched] = useState("");
  const [log, setLog] = useState<LogEntry[]>(loadLog);
  const [error, setError] = useState<string | null>(null);
  const [speechReady, setSpeechReady] = useState(true);
  const [tab, setTab] = useState<"saved" | "calls">("saved");
  const [typed, setTyped] = useState("");
  const [mode, setMode] = useState<"calls" | "train">("calls");

  const listeningRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<{ context: AudioContext; frame: number } | null>(null);
  const transcriptRef = useRef("");
  const carryRef = useRef("");
  const instanceFinalRef = useRef("");
  const committedCallsRef = useRef<SavedCall[]>([]);
  const acceptResultsRef = useRef(false);
  const holdTimerRef = useRef(0);
  const meterRef = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const Speech = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSpeechReady(Boolean(Speech));
    loadInclusions();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    } catch {
      // The in-memory log still stands if storage is full or blocked.
    }
  }, [log]);

  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, []);

  const latest = liveCalls[liveCalls.length - 1] ?? null;
  const highlight = latest ?? (log[0] ? { heard: log[0].heard, actionType: log[0].actionType } : null);

  const savedCount = log.length;
  const activeLabel = useMemo(() => latest?.heard ?? null, [latest]);

  function applyTranscript(text: string) {
    transcriptRef.current = text;
    const parsed = parseUtterance(text);
    setLiveCalls(parsed.calls);
    if (parsed.calls.length === 0) {
      setTranscript(text);
      setUnmatched(parsed.unmatched);
      return;
    }
    setTranscript(heardRemainder(text));
    setUnmatched("");
  }

  function appendCalls(calls: SavedCall[]) {
    if (calls.length === 0) return;
    setTab("saved");
    const at = Date.now();
    const entries: LogEntry[] = calls.map((call, index) => ({
      id: crypto.randomUUID(),
      heard: call.heard,
      actionType: call.actionType,
      at: at + index,
    }));
    setLog((current) => [...entries].reverse().concat(current));
  }

  function commitTranscript(text: string) {
    appendCalls(parseUtterance(text).calls);
  }

  function clearHold() {
    if (!holdTimerRef.current) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = 0;
  }

  function commitLive(text: string, holdTrailing: boolean) {
    clearHold();
    const already = committedCallsRef.current;
    const update = liveUpdate(text, already, holdTrailing);
    if (update.kind === "append") {
      committedCallsRef.current = already.concat(update.calls);
      appendCalls(update.calls);
    } else if (update.kind === "replace-last") {
      const replaced = already[already.length - 1];
      committedCallsRef.current = already.slice(0, -1).concat(update.calls);
      const at = Date.now();
      const entries: LogEntry[] = update.calls.map((call, index) => ({
        id: crypto.randomUUID(),
        heard: call.heard,
        actionType: call.actionType,
        at: at + index,
      }));
      setTab("saved");
      setLog((current) => {
        const head = current[0];
        const rest =
          head && head.heard === replaced.heard && head.actionType === replaced.actionType
            ? current.slice(1)
            : current;
        return [...entries].reverse().concat(rest);
      });
    }
    const stillGrowing = holdTrailing && callsToCommit(text, false).length > callsToCommit(text, true).length;
    if (!stillGrowing) return;
    const snapshot = text;
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = 0;
      if (transcriptRef.current !== snapshot) return;
      commitLive(snapshot, false);
    }, 450);
  }

  function resetTake() {
    clearHold();
    carryRef.current = "";
    instanceFinalRef.current = "";
    committedCallsRef.current = [];
  }

  function paintLevel(amount: number) {
    if (dotRef.current) dotRef.current.style.transform = `scale(${1 + amount * 0.45})`;
    if (meterRef.current) {
      meterRef.current.style.transform = `scaleX(${amount === 0 ? 0 : Math.max(0.04, amount)})`;
    }
  }

  async function startCapture() {
    setError(null);
    const Speech = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Speech) {
      setError("This browser can't hear speech. Use the call list, or open the page in Safari or Chrome.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const watch = () => {
        if (!listeningRef.current) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        paintLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        audioRef.current = {
          context,
          frame: requestAnimationFrame(watch),
        };
      };
      audioRef.current = { context, frame: requestAnimationFrame(watch) };
    } catch {
      setError("Allow the microphone to record a call.");
      return;
    }

    const recognition = new Speech();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 5;
    const GrammarList = window.SpeechGrammarList ?? window.webkitSpeechGrammarList;
    if (GrammarList) {
      try {
        const grammars = new GrammarList();
        grammars.addFromString(callGrammar(), 1);
        recognition.grammars = grammars;
      } catch {
        // This browser exposes grammars but refuses to apply them.
      }
    }
    recognition.onresult = (event) => {
      if (!acceptResultsRef.current) return;
      let finals = "";
      let interim = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const piece = preferredPiece(event.results[index]);
        if (event.results[index].isFinal) finals += `${piece} `;
        else interim += `${piece} `;
      }
      instanceFinalRef.current = finals.trim();
      const accumulated = [carryRef.current, finals.trim()].filter(Boolean).join(" ");
      const display = [accumulated, interim.trim()].filter(Boolean).join(" ");
      applyTranscript(display);
      commitLive(display, interim.trim().length > 0);
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      const message = SPEECH_ERRORS[event.error] ?? `The recording stopped (${event.error}). Tap Record to try again.`;
      setError(message);
      stopCapture();
    };
    recognition.onend = () => {
      if (!listeningRef.current) return;
      carryRef.current = [carryRef.current, instanceFinalRef.current].filter(Boolean).join(" ");
      instanceFinalRef.current = "";
      try {
        recognition.start();
      } catch {
        listeningRef.current = false;
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    acceptResultsRef.current = true;
    setListening(true);
    resetTake();
    applyTranscript("");
    try {
      recognition.start();
    } catch {
      stopCapture();
      setError("The recording didn't start. Tap Record to try again.");
    }
  }

  function stopCapture() {
    listeningRef.current = false;
    setListening(false);
    paintLevel(0);
    recognitionRef.current?.stop();
    acceptResultsRef.current = false;
    recognitionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioRef.current) {
      cancelAnimationFrame(audioRef.current.frame);
      void audioRef.current.context.close();
      audioRef.current = null;
    }
    commitLive(transcriptRef.current, false);
    resetTake();
  }

  function preferredPiece(result: SpeechRecognitionResult): string {
    const options: string[] = [];
    for (let index = 0; index < result.length; index += 1) {
      options.push(result[index]?.transcript ?? "");
    }
    return preferredTranscript(options);
  }

  function toggleRecording() {
    if (listeningRef.current) stopCapture();
    else void startCapture();
  }

  function tapCall(call: CallDefinition) {
    if (listeningRef.current) stopCapture();
    applyTranscript(call.label);
    commitTranscript(call.label);
  }

  function submitTyped(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = typed.trim();
    if (!text) return;
    if (listeningRef.current) stopCapture();
    applyTranscript(text);
    commitTranscript(text);
    setTyped("");
  }

  function removeEntry(id: string) {
    setLog((current) => current.filter((entry) => entry.id !== id));
  }

  function clearLog() {
    setLog([]);
    applyTranscript("");
  }

  if (mode === "train") {
    return <Training onClose={() => setMode("calls")} />;
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="eyebrow">NCAAF</p>
          <h1>Audio calls</h1>
        </div>
        <div className="top-actions">
          <button
            className="text-button"
            type="button"
            onClick={() => {
              if (listeningRef.current) stopCapture();
              setMode("train");
            }}
          >
            Train
          </button>
          <button className="text-button" type="button" onClick={clearLog} disabled={savedCount === 0 && !transcript}>
            Clear
          </button>
        </div>
      </header>

      <section className="hero" aria-live="polite">
        {highlight ? (
          <>
            <p className="hero-kicker">{listening && !latest ? "Listening" : "action.type"}</p>
            <p className="hero-type">{highlight.actionType}</p>
            <p className="hero-heard">Heard “{highlight.heard}”</p>
          </>
        ) : (
          <>
            <p className="hero-kicker">Ready</p>
            <p className="hero-empty">Say a call, or open Calls.</p>
          </>
        )}
      </section>

      <div className="dock">
        <button
          className={listening ? "record is-live" : "record"}
          type="button"
          onClick={toggleRecording}
        >
          <span className="record-dot" ref={dotRef} />
          <span>{listening ? "Stop" : "Record"}</span>
        </button>
        <div className="meter" aria-hidden="true">
          <span ref={meterRef} />
        </div>
      </div>

      <section className="panel">
        <h2>Heard</h2>
        <p className={transcript ? "transcript" : "transcript is-empty"}>
          {transcript || "Your words show up here while you record."}
        </p>
        {unmatched && <p className="unmatched">Not a call: {unmatched}</p>}
        {error && <p className="error">{error}</p>}
        {!speechReady && (
          <p className="error">Speech recognition isn't available here. Type or tap a call to test the mapping.</p>
        )}
        <form className="typed" onSubmit={submitTyped}>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Type a call, e.g. throw catch run tackle"
            aria-label="Type a call"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button type="submit" disabled={!typed.trim()}>
            Add
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="tabs" role="tablist" aria-label="Saved calls and call list">
          <button
            type="button"
            role="tab"
            id="tab-saved"
            aria-selected={tab === "saved"}
            aria-controls="panel-saved"
            className={tab === "saved" ? "is-selected" : undefined}
            onClick={() => setTab("saved")}
          >
            Saved <span>{savedCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-calls"
            aria-selected={tab === "calls"}
            aria-controls="panel-calls"
            className={tab === "calls" ? "is-selected" : undefined}
            onClick={() => setTab("calls")}
          >
            Calls <span>{CALLS.length}</span>
          </button>
        </div>

        {tab === "saved" ? (
          <div role="tabpanel" id="panel-saved" aria-labelledby="tab-saved">
            {log.length === 0 ? (
              <p className="empty">Nothing saved yet.</p>
            ) : (
              <ul className="log">
                {log.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <p className="log-type">{entry.actionType}</p>
                      <p className="log-meta">
                        {entry.heard}
                        <span>{formatTime(entry.at)}</span>
                      </p>
                    </div>
                    <button type="button" onClick={() => removeEntry(entry.id)} aria-label={`Remove ${entry.actionType}`}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div role="tabpanel" id="panel-calls" aria-labelledby="tab-calls">
            <div className="calls">
              {CALLS.map((call) => {
                const active = activeLabel === call.label;
                return (
                  <button
                    key={call.label}
                    type="button"
                    className={active ? "call is-active" : "call"}
                    onClick={() => tapCall(call)}
                  >
                    <span>{call.label}</span>
                    <span>{call.actionType}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
