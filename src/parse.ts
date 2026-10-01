export type CallDefinition = {
  label: string;
  phrases: string[];
  actionType: string;
};

const FIELD_GOAL = ["field goal", "fieldgoal", "field goals", "feel goal", "field gold", "field go", "fill goal"];

function withFieldGoal(endings: string[]): string[] {
  return FIELD_GOAL.flatMap((stem) => endings.map((ending) => `${stem} ${ending}`));
}

export const CALLS: CallDefinition[] = [
  { label: "Snap", phrases: ["snap", "snaps", "snapped", "snapping"], actionType: "Snap" },
  { label: "Kick Off", phrases: ["kick off", "kickoff"], actionType: "Kickoff" },
  { label: "Return", phrases: ["return"], actionType: "Return" },
  {
    label: "Tackle",
    phrases: ["tackle", "tackled", "tackles", "tackling", "tacle", "tickle"],
    actionType: "Tackle",
  },
  {
    label: "Throw",
    phrases: ["throw", "throws", "threw", "thrown", "throwing", "through", "throat"],
    actionType: "PassAttempt",
  },
  { label: "Catch", phrases: ["catch", "catches", "caught", "catched"], actionType: "CompletePass" },
  { label: "Run", phrases: ["run", "ran", "running"], actionType: "RunAfterCatch" },
  { label: "Rush", phrases: ["rush", "rushed", "rushes", "rushing", "brush"], actionType: "Run" },
  {
    label: "Incomplete",
    phrases: ["incomplete", "in complete", "incompleted", "not complete", "incompletes"],
    actionType: "IncompletePass",
  },
  { label: "Sack", phrases: ["sack", "sacks", "sacked", "sacking", "sac"], actionType: "Sack" },
  {
    label: "Punt",
    phrases: ["punt", "punts", "punted", "punting", "punt it", "hunt", "hunts", "bunt", "bunted", "pump"],
    actionType: "Punt",
  },
  {
    label: "Fair Catch",
    phrases: [
      "fair catch",
      "faircatch",
      "fare catch",
      "farecatch",
      "fair cats",
      "fair cat",
      "fair cash",
      "for catch",
      "their catch",
      "there catch",
      "faircats",
    ],
    actionType: "FairCatch",
  },
  {
    label: "Out of Bounds",
    phrases: ["out of bounds", "out of bound", "outta bounds", "out of bounce", "outbound"],
    actionType: "OutOfBounds",
  },
  { label: "Touchdown", phrases: ["touchdown", "touch down", "touchdowns"], actionType: "Touchdown" },
  {
    label: "Conversion Attempt",
    phrases: [
      "conversion attempt",
      "conversion attempts",
      "conversion attempted",
      "conversation attempt",
      "conversion a tempt",
    ],
    actionType: "ConversionAttempt",
  },
  {
    label: "Conversion Made",
    phrases: ["conversion made", "conversion maid", "conversions made", "conversation made"],
    actionType: "ConversionMade",
  },
  { label: "Touch back", phrases: ["touch back", "touchback"], actionType: "Touchback" },
  {
    label: "Field Goal Attempt",
    phrases: withFieldGoal(["attempt", "attempts", "attempted", "a tempt", "at tempt", "temp", "try"]),
    actionType: "FieldGoalAttempt",
  },
  {
    label: "Field Goal Missed",
    phrases: withFieldGoal(["missed", "miss", "misses", "mist", "is missed", "no good", "is no good", "wide"]),
    actionType: "FieldGoalMissed",
  },
  {
    label: "Field Goal Made",
    phrases: withFieldGoal(["made", "make", "maid", "makes", "good", "is good", "is made"]),
    actionType: "FieldGoalMade",
  },
  {
    label: "Muff",
    phrases: ["muff", "muffs", "muffed", "muffing", "muff it", "mugh", "moff", "mough"],
    actionType: "Muff",
  },
  {
    label: "Recovery",
    phrases: ["recovery", "recovered", "recover", "recovers", "recovering", "discovery", "we covered", "re covery"],
    actionType: "Recovery",
  },
  {
    label: "Fumble",
    phrases: ["fumble", "fumbles", "fumbled", "fumbling", "humble", "fumbo", "fun bill", "fumble it"],
    actionType: "Fumble",
  },
  {
    label: "Interception",
    phrases: [
      "interception",
      "interceptions",
      "intercepted",
      "intercept",
      "intercepts",
      "inception",
      "inter ception",
      "interseption",
      "picked off",
      "pick six",
    ],
    actionType: "Interception",
  },
  { label: "Add", phrases: [], actionType: "yardgain" },
  {
    label: "0yardgain",
    phrases: ["0yardgain", "0 yard gain", "zero yard gain"],
    actionType: "0yardgain",
  },
];

export type ParsedCall = {
  heard: string;
  actionType: string;
  start: number;
  end: number;
};

type Phrase = {
  phrase: string;
  label: string;
  actionType: string;
};

const PHRASES: Phrase[] = CALLS.flatMap((call) =>
  call.phrases.map((phrase) => ({
    phrase,
    label: call.label,
    actionType: call.actionType,
  })),
);

export type Inclusion = {
  label: string;
  actionType: string;
  phrase: string;
};

const INCLUSION_KEY = "ncaaf-audio-inclusions";
let extras: Phrase[] = [];

function allPhrases(): Phrase[] {
  const included = extras.filter((item) => item.label !== "Add");
  return included.length === 0 ? PHRASES : PHRASES.concat(included);
}

export function setInclusionPhrases(items: Inclusion[]) {
  extras = items
    .map((item) => ({
      label: item.label,
      actionType: item.actionType,
      phrase: normalizeUtterance(item.phrase),
    }))
    .filter((item) => item.phrase.length > 0);
}

export function loadInclusions(): Inclusion[] {
  try {
    const raw = localStorage.getItem(INCLUSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Inclusion[];
    if (!Array.isArray(parsed)) return [];
    setInclusionPhrases(parsed);
    return extras.map((item) => ({ ...item }));
  } catch {
    return [];
  }
}

export function isKnownPhrase(label: string, phrase: string): boolean {
  const normal = normalizeUtterance(phrase);
  if (!normal) return false;
  const call = CALLS.find((item) => item.label === label);
  if (call?.phrases.includes(normal)) return true;
  return extras.some((item) => item.label === label && item.phrase === normal);
}

export function addInclusion(label: string, actionType: string, phrase: string): boolean {
  const normal = normalizeUtterance(phrase);
  if (!normal || isKnownPhrase(label, normal)) return false;
  extras = extras.concat({ label, actionType, phrase: normal });
  try {
    localStorage.setItem(INCLUSION_KEY, JSON.stringify(extras));
  } catch {
    // The in-memory inclusion still applies for this session.
  }
  return true;
}

export function inclusionsFor(label: string): string[] {
  return extras.filter((item) => item.label === label).map((item) => item.phrase);
}

export function normalizeUtterance(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type TrainingRow = {
  name: string;
  word: string;
  actionType: string;
  heard: string;
};

/** One row per mishear, in call order, so several people's results can be pasted into one sheet. */
export function trainingRows(
  attempts: { expectedLabel: string; expectedType: string; raw: string }[],
  name: string,
): TrainingRow[] {
  const who = name.trim();
  const seen = new Set<string>();
  const grouped = new Map<string, TrainingRow[]>();
  for (const attempt of attempts) {
    const heard = attempt.raw.trim();
    if (!heard) continue;
    const key = `${attempt.expectedLabel}:${heard}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = grouped.get(attempt.expectedLabel) ?? [];
    list.push({ name: who, word: attempt.expectedLabel, actionType: attempt.expectedType, heard });
    grouped.set(attempt.expectedLabel, list);
  }

  const rows: TrainingRow[] = [];
  const seenLabels = new Set<string>();
  for (const label of [...CALLS.map((call) => call.label), ...grouped.keys()]) {
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    rows.push(...(grouped.get(label) ?? []));
  }
  return rows;
}

function tsvCell(value: string): string {
  return value.replace(/[\t\r\n]/g, " ");
}

/** Tab-separated rows. Pasting into a spreadsheet puts each field in its own column. */
export function trainingReport(rows: TrainingRow[]): string {
  const header = ["Name", "word", "action.type", "heard"].join("\t");
  const lines = rows.map((row) => [row.name, row.word, row.actionType, row.heard].map(tsvCell).join("\t"));
  return `${[header, ...lines].join("\n")}\n`;
}

/** Separate mishears. A long run of words stays split; a short phrase is kept as well as its words. */
export function trainingIssues(transcript: string): string[] {
  const normal = normalizeUtterance(transcript);
  if (!normal) return [];
  const words = [...new Set(normal.split(" ").filter(Boolean))];
  if (words.length > 1 && words.length <= 3) return [...words, normal];
  return words;
}

export function parseUtterance(raw: string): { calls: ParsedCall[]; unmatched: string } {
  const text = normalizeUtterance(raw);
  if (!text) return { calls: [], unmatched: "" };

  const calls: ParsedCall[] = [];
  const unmatched: string[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] === " ") {
      index += 1;
      continue;
    }

    const yard = matchYardGain(text, index);
    let best: Phrase | null = null;
    for (const phrase of allPhrases()) {
      if (!startsAtToken(text, index, phrase.phrase)) continue;
      if (!best || phrase.phrase.length > best.phrase.length) best = phrase;
    }

    if (yard && (!best || yard.end - index >= best.phrase.length)) {
      calls.push({
        heard: `Add ${yard.yards}`,
        actionType: `${yard.yards}yardgain`,
        start: index,
        end: yard.end,
      });
      index = yard.end;
      continue;
    }

    if (best) {
      const end = index + best.phrase.length;
      calls.push({
        heard: best.label,
        actionType: best.actionType,
        start: index,
        end,
      });
      index = end;
      continue;
    }

    const nextSpace = text.indexOf(" ", index);
    const end = nextSpace === -1 ? text.length : nextSpace;
    unmatched.push(text.slice(index, end));
    index = end;
  }

  return { calls, unmatched: unmatched.join(" ") };
}

/** Words still waiting after the latest identified call. Empty once a call ends the phrase. */
export function heardRemainder(raw: string): string {
  const text = normalizeUtterance(raw);
  const { calls } = parseUtterance(text);
  if (calls.length === 0) return raw;
  return text.slice(calls[calls.length - 1].end).trim();
}

export type SavedCall = {
  heard: string;
  actionType: string;
};

export function callGrammar(): string {
  const spoken = [
    ...new Set([...CALLS.flatMap((call) => call.phrases), ...extras.map((item) => item.phrase)]),
  ].filter(Boolean);
  const stems = yardStems().join(" | ");
  const numbers = yardGrammarNumbers().join(" | ");
  return `#JSGF V1.0; grammar calls; public <call> = ${spoken.join(" | ")} | <yards> ; <yards> = ( ${stems} ) <n> ; <n> = ${numbers} ;`;
}

function isExtendablePhrase(phrase: string): boolean {
  return allPhrases().some(
    (entry) => entry.phrase.length > phrase.length && entry.phrase.endsWith(` ${phrase}`),
  );
}

/** Keep the first guess when it is already a call. A later guess can replace it only by extending that call, such as "catch" to "fair catch". */
export function preferredTranscript(options: string[]): string {
  const ranked = options.map((option) => option.trim()).filter(Boolean);
  if (ranked.length === 0) return "";
  const top = ranked[0];
  if (parseUtterance(top).calls.length === 0) {
    return ranked.find((option) => parseUtterance(option).calls.length > 0) ?? top;
  }
  const upgrade = ranked.slice(1).find((option) => isLongerForm(top, option));
  return upgrade ?? top;
}

function isLongerForm(shorterText: string, longerText: string): boolean {
  const shorter = parseUtterance(shorterText).calls;
  const longer = parseUtterance(longerText).calls;
  if (shorter.length === 0 || longer.length === 0) return false;
  return shorter.every((call) =>
    longer.some((next) =>
      extendsCall(
        { heard: call.heard, actionType: call.actionType },
        { heard: next.heard, actionType: next.actionType },
      ),
    ),
  );
}

function extendsCall(previous: SavedCall, incoming: SavedCall): boolean {
  if (
    previous.heard.startsWith("Add ") &&
    incoming.heard.startsWith("Add ") &&
    previous.actionType.endsWith("yardgain") &&
    incoming.actionType.endsWith("yardgain") &&
    previous.actionType !== incoming.actionType
  ) {
    return true;
  }
  const shorter = CALLS.find((call) => call.label === previous.heard)?.phrases ?? [];
  const longer = CALLS.find((call) => call.label === incoming.heard)?.phrases ?? [];
  return longer.some((phrase) => shorter.some((short) => phrase.endsWith(` ${short}`)));
}

/** Calls ready to save. A trailing "catch" can still grow into "fair catch" while speech is interim. */
export function callsToCommit(raw: string, holdTrailing: boolean): SavedCall[] {
  const text = normalizeUtterance(raw);
  const { calls } = parseUtterance(text);
  let visible = calls;
  if (holdTrailing && calls.length > 0) {
    const last = calls[calls.length - 1];
    const phrase = text.slice(last.start, last.end);
    const growingNumber = last.heard.startsWith("Add ") && /\d$/.test(phrase);
    if (last.end === text.length && (isExtendablePhrase(phrase) || growingNumber)) visible = calls.slice(0, -1);
  }
  return visible.map((call) => ({ heard: call.heard, actionType: call.actionType }));
}

export type LiveUpdate =
  | { kind: "append"; calls: SavedCall[] }
  | { kind: "replace-last"; calls: SavedCall[] }
  | { kind: "none" };

function sameCall(left: SavedCall, right: SavedCall): boolean {
  return left.heard === right.heard && left.actionType === right.actionType;
}

/** Calls in the new transcript that are not already saved, even if earlier words were rewritten. */
function callsNotYetSaved(already: SavedCall[], ready: SavedCall[]): SavedCall[] {
  const used = already.map(() => false);
  const extras: SavedCall[] = [];
  for (const call of ready) {
    const match = already.findIndex((saved, index) => !used[index] && sameCall(saved, call));
    if (match === -1) extras.push(call);
    else used[match] = true;
  }
  return extras;
}

/** New calls to save. A late "fair catch" replaces a "catch" that was saved too early. */
export function liveUpdate(raw: string, already: SavedCall[], holdTrailing: boolean): LiveUpdate {
  const ready = callsToCommit(raw, holdTrailing);
  const prefixMatches = already.every((call, index) => ready[index] && sameCall(call, ready[index]));
  if (prefixMatches) {
    const extra = ready.slice(already.length);
    return extra.length > 0 ? { kind: "append", calls: extra } : { kind: "none" };
  }
  if (already.length > 0) {
    const stem = already.slice(0, -1);
    const stemMatches = stem.every((call, index) => ready[index] && sameCall(call, ready[index]));
    const revised = ready.slice(stem.length);
    if (stemMatches && revised.length > 0 && extendsCall(already[already.length - 1], revised[0])) {
      return { kind: "replace-last", calls: revised };
    }
  }
  const extras = callsNotYetSaved(already, ready);
  return extras.length > 0 ? { kind: "append", calls: extras } : { kind: "none" };
}

/** Calls in `raw` that are not already in `already`. Null when earlier words were rewritten. */
export function freshCalls(raw: string, already: SavedCall[]): SavedCall[] | null {
  const { calls } = parseUtterance(raw);
  const prefixMatches = already.every(
    (call, index) => calls[index]?.heard === call.heard && calls[index]?.actionType === call.actionType,
  );
  if (!prefixMatches) return null;
  return calls.slice(already.length).map((call) => ({
    heard: call.heard,
    actionType: call.actionType,
  }));
}

const YARD_STEMS = ["added", "add", "plus", "and", "had", "at"];

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  tan: 10,
};

const TENS_NUMBERS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function yardStems(): string[] {
  const included = extras
    .filter((item) => item.label === "Add" && !item.phrase.includes(" "))
    .map((item) => item.phrase);
  return [...new Set([...YARD_STEMS, ...included])].sort((left, right) => right.length - left.length);
}

function yardGrammarNumbers(): string[] {
  const digits = Array.from({ length: 101 }, (_, value) => String(value));
  const words = [
    ...Object.keys(SMALL_NUMBERS),
    ...Object.keys(TENS_NUMBERS),
    "hundred",
    "a hundred",
    "one hundred",
  ];
  for (const tens of Object.keys(TENS_NUMBERS)) {
    for (const [ones, extra] of Object.entries(SMALL_NUMBERS)) {
      if (extra > 0 && extra < 10) words.push(`${tens} ${ones}`);
    }
  }
  return [...new Set([...digits, ...words])];
}

function tokenAt(text: string, index: number): { token: string; end: number } | null {
  if (index >= text.length || text[index] === " ") return null;
  const next = text.indexOf(" ", index);
  const end = next === -1 ? text.length : next;
  return { token: text.slice(index, end), end };
}

function readNumber(text: string, index: number): { value: number; end: number } | null {
  const first = tokenAt(text, index);
  if (!first) return null;
  if (/^\d+$/.test(first.token)) return { value: Number(first.token), end: first.end };
  if (first.token === "hundred") return { value: 100, end: first.end };
  const second = text[first.end] === " " ? tokenAt(text, first.end + 1) : null;
  if ((first.token === "a" || first.token === "one") && second?.token === "hundred") {
    return { value: 100, end: second.end };
  }
  if (first.token in SMALL_NUMBERS) return { value: SMALL_NUMBERS[first.token], end: first.end };
  if (first.token in TENS_NUMBERS) {
    let value = TENS_NUMBERS[first.token];
    let end = first.end;
    if (second && second.token in SMALL_NUMBERS && SMALL_NUMBERS[second.token] < 10) {
      value += SMALL_NUMBERS[second.token];
      end = second.end;
    }
    return { value, end };
  }
  return null;
}

/** "add" plus a number, including the old mishear stems. Optional "yards" is part of the same call. */
function matchYardGain(text: string, index: number): { yards: number; end: number } | null {
  const stem = yardStems().find((candidate) => startsAtToken(text, index, candidate));
  if (!stem || text[index + stem.length] !== " ") return null;
  const number = readNumber(text, index + stem.length + 1);
  if (!number) return null;
  let end = number.end;
  const unit = text.startsWith(" yards", end) ? " yards" : text.startsWith(" yard", end) ? " yard" : "";
  if (unit) {
    const unitEnd = end + unit.length;
    if (unitEnd === text.length || text[unitEnd] === " ") end = unitEnd;
  }
  return { yards: number.value, end };
}

function startsAtToken(text: string, index: number, phrase: string): boolean {
  if (!text.startsWith(phrase, index)) return false;
  const end = index + phrase.length;
  return end === text.length || text[end] === " ";
}
