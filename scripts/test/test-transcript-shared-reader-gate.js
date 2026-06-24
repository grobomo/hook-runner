// Test transcript-shared-reader-gate
"use strict";
var path = require("path");

var passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log("  PASS: " + msg); }
  else { failed++; console.log("  FAIL: " + msg); }
}

var gate = require(path.join(__dirname, "../../modules/PreToolUse/transcript-shared-reader-gate.js"));

function readInput(filePath) {
  return { tool_name: "Read", tool_input: { file_path: filePath } };
}
function bashInput(cmd) {
  return { tool_name: "Bash", tool_input: { command: cmd } };
}

console.log("\n=== transcript-shared-reader-gate tests ===\n");

console.log("--- Module contract ---");
ok(typeof gate === "function", "exports a function");

console.log("--- Non-matching tools ---");
ok(gate({ tool_name: "Edit", tool_input: {} }) === null, "ignores Edit");
ok(gate({ tool_name: "Write", tool_input: {} }) === null, "ignores Write");
ok(gate({ tool_name: "Grep", tool_input: {} }) === null, "ignores Grep");

console.log("--- Read: transcript JSONL blocked ---");
var r1 = gate(readInput(".claude/projects/abc123/conversation.jsonl"));
ok(r1 && r1.decision === "block", "blocks direct read of transcript JSONL");
ok(r1 && /FALSE POSITIVE/.test(r1.reason), "block has FALSE POSITIVE escape");

var r2 = gate(readInput("/tmp/.claude/projects/def456/session.jsonl"));
ok(r2 && r2.decision === "block", "blocks full path transcript read");

console.log("--- Read: non-transcript files pass ---");
ok(gate(readInput("TODO.md")) === null, "allows TODO.md");
ok(gate(readInput(".claude/settings.json")) === null, "allows settings.json");
ok(gate(readInput("some/random/file.jsonl")) === null, "allows non-project JSONL");
ok(gate(readInput(".claude/hooks/hook-log.jsonl")) === null, "allows hook-log");

console.log("--- Bash: ad-hoc transcript parsing blocked ---");
var r3 = gate(bashInput("cat .claude/projects/abc/conversation.jsonl"));
ok(r3 && r3.decision === "block", "blocks cat of transcript");

var r4 = gate(bashInput("grep 'human' .claude/projects/abc/session.jsonl"));
ok(r4 && r4.decision === "block", "blocks grep of transcript");

var r5 = gate(bashInput("head -20 .claude/projects/abc/data.jsonl"));
ok(r5 && r5.decision === "block", "blocks head of transcript");

var r6 = gate(bashInput("python parse.py .claude/projects/abc/session.jsonl"));
ok(r6 && r6.decision === "block", "blocks python parsing of transcript");

var r7 = gate(bashInput("node parser.js .claude/projects/abc/session.jsonl"));
ok(r7 && r7.decision === "block", "blocks node parsing of transcript");

console.log("--- Bash: shared reader allowed ---");
ok(gate(bashInput("node -e 'haiku-client getConversationContext .claude/projects/abc/s.jsonl'")) === null, "allows haiku-client usage");
ok(gate(bashInput("node -e 'getConversationContext(.claude/projects/abc/s.jsonl)'")) === null, "allows getConversationContext call");

console.log("--- Bash: metadata commands allowed ---");
ok(gate(bashInput("wc -l .claude/projects/abc/session.jsonl")) === null, "allows wc -l (line count)");
ok(gate(bashInput("ls .claude/projects/abc/")) === null, "allows ls of project dir");

console.log("--- Bash: unrelated commands pass ---");
ok(gate(bashInput("echo hello")) === null, "allows unrelated bash");
ok(gate(bashInput("cat package.json")) === null, "allows cat of non-transcript");

console.log("\n    " + passed + " passed, " + failed + " failed\n");
process.exit(failed > 0 ? 1 : 0);
