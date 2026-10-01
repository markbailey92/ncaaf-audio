import assert from "node:assert/strict";
import {
  callsToCommit,
  freshCalls,
  heardRemainder,
  liveUpdate,
  parseUtterance,
  preferredTranscript,
  setInclusionPhrases,
  trainingIssues,
  fullTrainingPhrases,
  trainingReport,
  trainingRows,
} from "./parse.ts";

function types(text: string): string[] {
  return parseUtterance(text).calls.map((call) => call.actionType);
}

assert.deepEqual(types("snap"), ["Snap"]);
assert.deepEqual(types("snapped"), ["Snap"]);
assert.deepEqual(types("flag"), ["Flag"]);
assert.deepEqual(types("flagged"), ["Flag"]);
assert.deepEqual(types("throw"), ["PassAttempt"]);
assert.deepEqual(types("through"), ["PassAttempt"]);
assert.deepEqual(types("threw"), ["PassAttempt"]);
assert.deepEqual(types("throat"), ["PassAttempt"]);
assert.equal(preferredTranscript(["throw", "touchdown"]), "throw");
assert.equal(preferredTranscript(["through", "hello"]), "through");
assert.equal(preferredTranscript(["hello", "throw"]), "throw");
assert.equal(preferredTranscript(["catch", "fair catch"]), "fair catch");
assert.deepEqual(types("field goal attempt"), ["FieldGoalAttempt"]);
assert.deepEqual(types("field goal attempted"), ["FieldGoalAttempt"]);
assert.deepEqual(types("feel goal attempt"), ["FieldGoalAttempt"]);
assert.deepEqual(types("fieldgoal missed"), ["FieldGoalMissed"]);
assert.deepEqual(types("field goal is no good"), ["FieldGoalMissed"]);
assert.deepEqual(types("field goal mist"), ["FieldGoalMissed"]);
assert.deepEqual(types("field goal made"), ["FieldGoalMade"]);
assert.deepEqual(types("field goal is good"), ["FieldGoalMade"]);
assert.deepEqual(types("field goal maid"), ["FieldGoalMade"]);
assert.deepEqual(types("recovered"), ["Recovery"]);
assert.deepEqual(types("fumbled"), ["Fumble"]);
assert.deepEqual(types("humble"), ["Fumble"]);
assert.deepEqual(types("intercepted"), ["Interception"]);
assert.deepEqual(types("interception"), ["Interception"]);
assert.deepEqual(types("add ten"), ["10yardgain"]);
assert.deepEqual(types("at 10"), ["10yardgain"]);
assert.deepEqual(types("and ten"), ["10yardgain"]);
assert.deepEqual(types("add 10 yards"), ["10yardgain"]);
assert.deepEqual(types("add 15"), ["15yardgain"]);
assert.deepEqual(types("add fifteen"), ["15yardgain"]);
assert.deepEqual(types("plus twenty five"), ["25yardgain"]);
assert.deepEqual(types("add 0"), ["0yardgain"]);
assert.deepEqual(types("add"), []);
assert.deepEqual(types("throw catch run tackle"), [
  "PassAttempt",
  "CompletePass",
  "RunAfterCatch",
  "Tackle",
]);
assert.deepEqual(types("rush"), ["Run"]);
assert.deepEqual(types("run"), ["RunAfterCatch"]);
assert.deepEqual(types("kick off"), ["Kickoff"]);
assert.deepEqual(types("kickoff"), ["Kickoff"]);
assert.deepEqual(types("touch back"), ["Touchback"]);
assert.deepEqual(types("touchback"), ["Touchback"]);
assert.deepEqual(types("field goal missed"), ["FieldGoalMissed"]);
assert.deepEqual(types("add 10"), ["10yardgain"]);
assert.deepEqual(parseUtterance("add 22").calls.map((call) => call.heard), ["Add 22"]);
assert.deepEqual(types("add 100"), ["100yardgain"]);
assert.deepEqual(types("add a hundred"), ["100yardgain"]);
assert.deepEqual(types("tackle add 7"), ["Tackle", "7yardgain"]);
assert.deepEqual(callsToCommit("add 1", true), []);
assert.deepEqual(callsToCommit("add 15", false), [{ heard: "Add 15", actionType: "15yardgain" }]);
assert.deepEqual(callsToCommit("add fifteen", true), [{ heard: "Add 15", actionType: "15yardgain" }]);
assert.deepEqual(
  liveUpdate("add 15", [{ heard: "Add 1", actionType: "1yardgain" }], false),
  { kind: "replace-last", calls: [{ heard: "Add 15", actionType: "15yardgain" }] },
);
assert.deepEqual(types("0yardgain"), []);
assert.deepEqual(types("0 yard gain"), []);
assert.deepEqual(types("zero yard gain"), []);
assert.deepEqual(types("0"), []);
assert.deepEqual(types("return"), ["Return"]);
assert.equal(parseUtterance("hello throw please").unmatched, "hello please");
assert.equal(heardRemainder("throw"), "");
assert.equal(heardRemainder("hello throw"), "");
assert.equal(heardRemainder("throw catch"), "");
assert.equal(heardRemainder("throw please"), "please");
assert.equal(heardRemainder("hello"), "hello");
assert.deepEqual(freshCalls("tack", []), []);
assert.deepEqual(freshCalls("tackle", []), [{ heard: "Tackle", actionType: "Tackle" }]);
assert.deepEqual(freshCalls("tackle catch", [{ heard: "Tackle", actionType: "Tackle" }]), [
  { heard: "Catch", actionType: "CompletePass" },
]);
assert.equal(freshCalls("rush", [{ heard: "Tackle", actionType: "Tackle" }]), null);
assert.deepEqual(types("punt"), ["Punt"]);
assert.deepEqual(types("punted"), ["Punt"]);
assert.deepEqual(types("hunt"), ["Punt"]);
assert.deepEqual(types("bunt"), ["Punt"]);
assert.deepEqual(types("muff"), ["Muff"]);
assert.deepEqual(types("muffed"), ["Muff"]);
assert.deepEqual(types("fair catch"), ["FairCatch"]);
assert.deepEqual(types("fare catch"), ["FairCatch"]);
assert.deepEqual(types("faircatch"), ["FairCatch"]);
assert.deepEqual(types("for catch"), ["FairCatch"]);
assert.deepEqual(types("their catch"), ["FairCatch"]);
assert.deepEqual(callsToCommit("catch", true), []);
assert.deepEqual(callsToCommit("catch", false), [{ heard: "Catch", actionType: "CompletePass" }]);
assert.deepEqual(callsToCommit("fair catch", true), [{ heard: "Fair Catch", actionType: "FairCatch" }]);
assert.deepEqual(callsToCommit("throw catch", true), [{ heard: "Throw", actionType: "PassAttempt" }]);
assert.deepEqual(
  liveUpdate("fair catch", [{ heard: "Catch", actionType: "CompletePass" }], false),
  { kind: "replace-last", calls: [{ heard: "Fair Catch", actionType: "FairCatch" }] },
);
assert.deepEqual(
  liveUpdate("kick off throw", [
    { heard: "Kick Off", actionType: "Kickoff" },
    { heard: "Return", actionType: "Return" },
  ], false),
  { kind: "append", calls: [{ heard: "Throw", actionType: "PassAttempt" }] },
);
assert.deepEqual(types("tackled"), ["Tackle"]);
assert.deepEqual(types("tickle"), ["Tackle"]);
assert.deepEqual(types("caught"), ["CompletePass"]);
assert.deepEqual(types("ran"), ["RunAfterCatch"]);
assert.deepEqual(types("brush"), ["Run"]);
assert.deepEqual(types("in complete"), ["IncompletePass"]);
assert.deepEqual(types("sacked"), ["Sack"]);
assert.deepEqual(types("out of bounce"), ["OutOfBounds"]);
assert.deepEqual(types("outta bounds"), ["OutOfBounds"]);
assert.deepEqual(types("touch down"), ["Touchdown"]);
assert.deepEqual(types("conversation attempt"), ["ConversionAttempt"]);
assert.deepEqual(types("conversion maid"), ["ConversionMade"]);
setInclusionPhrases([{ label: "Tackle", actionType: "Tackle", phrase: "zooble" }]);
assert.deepEqual(types("zooble"), ["Tackle"]);
setInclusionPhrases([]);
assert.deepEqual(types("zooble"), []);
assert.deepEqual(trainingIssues("tickle"), ["tickle"]);
assert.deepEqual(trainingIssues("fare catch"), ["fare catch"]);
assert.deepEqual(trainingIssues("etch"), ["etch"]);
assert.deepEqual(trainingIssues("tickle tackle through the"), ["tickle tackle through the"]);
assert.deepEqual(fullTrainingPhrases(["et", "ch", "etch"]), ["etch"]);
const rows = trainingRows(
  [
    { expectedLabel: "Fair Catch", expectedType: "FairCatch", raw: "fare catch" },
    { expectedLabel: "Tackle", expectedType: "Tackle", raw: "tickle" },
    { expectedLabel: "Tackle", expectedType: "Tackle", raw: "tickle" },
    { expectedLabel: "Tackle", expectedType: "Tackle", raw: "tackled" },
  ],
);
assert.deepEqual(rows, [
  { word: "Fair Catch", heard: "fare catch", actionType: "FairCatch" },
  { word: "Tackle", heard: "tickle", actionType: "Tackle" },
  { word: "Tackle", heard: "tackled", actionType: "Tackle" },
]);
assert.equal(
  trainingReport(rows),
  "word\theard\taction.type\nFair Catch\tfare catch\tFairCatch\nTackle\ttickle\tTackle\nTackle\ttackled\tTackle\n",
);
assert.equal(trainingReport([]), "word\theard\taction.type\n");

console.log("parse tests passed");
