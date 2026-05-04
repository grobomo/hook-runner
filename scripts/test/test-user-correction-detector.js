#!/usr/bin/env node
"use strict";
// T603: Tests for user-correction-detector.js (PostToolUse)
// Detects user corrections in real-time via prompt-log analysis.

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "user-correction-detector.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

function loadMod() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

// === detectCorrection tests (pure pattern matching) ===

// --- Strong patterns: should detect ---

check("'No, that's wrong' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("No, that's wrong");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'No you need to do X' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("No you need to do X instead");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'No! Don't do that' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("No! Don't do that");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'Wrong, I said PostToolUse' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Wrong, I said PostToolUse not PreToolUse");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'That's not right' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("That's not right, look at the spec again");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'I already told you to use snake_case' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("I already told you to use snake_case");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'I said use PostToolUse' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("I said use PostToolUse, not Stop");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'As I mentioned, it should be async' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("As I mentioned, it should be async");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'Not what I asked for' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("That's not what I asked for");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'You should have used the Edit tool' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("You should have used the Edit tool");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'You forgot to add tests' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("You forgot to add tests for this");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'You skipped the validation step' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("You skipped the validation step");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'That's incorrect' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("That's incorrect, the port should be 8080");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'Try again with the correct path' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Try again with the correct path");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'Do it again but this time...' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Do it again but this time use the right file");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'Stop doing that' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Stop doing that, use the Edit tool instead");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'Stop ignoring my instructions' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Stop ignoring my instructions");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'How many times do I have to say' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("How many times do I have to say this");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'I told you not to use rules' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("I told you not to use rules files");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'Read my message again' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Read my message again, I said PostToolUse");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'Pay attention to the requirements' → strong", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Pay attention to the requirements");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

// --- Moderate patterns: should detect (short prompts only) ---

check("'No.' (standalone) → moderate", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("No.");
  assert(r !== null, "should detect");
  assert(r.strength === "moderate");
});

check("'Nope' → moderate", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Nope");
  assert(r !== null, "should detect");
  assert(r.strength === "moderate");
});

check("'Wrong!' → strong (matches leading 'wrong' pattern)", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Wrong!");
  assert(r !== null, "should detect");
  assert(r.strength === "strong");
});

check("'Stop' → moderate", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Stop");
  assert(r !== null, "should detect");
  assert(r.strength === "moderate");
});

check("'Cancel' → moderate", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Cancel");
  assert(r !== null, "should detect");
  assert(r.strength === "moderate");
});

check("'I didn't ask for that' → moderate", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("I didn't ask for that");
  assert(r !== null, "should detect");
  assert(r.strength === "moderate");
});

check("'That's not it' → moderate", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("That's not it");
  assert(r !== null, "should detect");
  assert(r.strength === "moderate");
});

check("'Completely wrong' → moderate", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Completely wrong");
  assert(r !== null, "should detect");
  assert(r.strength === "moderate");
});

check("'Why did you delete that file' → moderate", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Why did you delete that file");
  assert(r !== null, "should detect");
  assert(r.strength === "moderate");
});

check("'You're not listening' → moderate", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("You're not listening");
  assert(r !== null, "should detect");
  assert(r.strength === "moderate");
});

check("'You are doing it wrong' → moderate", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("You are doing it wrong");
  assert(r !== null, "should detect");
  assert(r.strength === "moderate");
});

// --- Moderate patterns: should NOT detect when prompt is long ---

check("'Why did you...' in long prompt → null (too long for moderate)", function() {
  var mod = loadMod();
  var long = "Why did you choose that approach? " + "x".repeat(150);
  var r = mod._detectCorrection(long);
  assert(r === null, "should not detect — too long for moderate");
});

// --- Should NOT detect (false positive avoidance) ---

check("'Build the user correction module' → null (task verb)", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Build the user correction module");
  assert(r === null, "should not detect — task verb");
});

check("'Create a new test file' → null (task verb)", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Create a new test file for the detector");
  assert(r === null, "should not detect — task verb");
});

check("'Fix the bug in parser.js' → null (task, not correction)", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Fix the bug in parser.js");
  assert(r === null, "should not detect — fix task");
});

check("'Add error handling to the module' → null (task verb)", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Add error handling to the module");
  assert(r === null, "should not detect — task verb");
});

check("'Run the test suite' → null (task verb)", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Run the test suite and check for failures");
  assert(r === null, "should not detect — task verb");
});

check("'Hello claude' → null (greeting)", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Hello claude, how are you?");
  assert(r === null, "should not detect — greeting");
});

check("'/commit' → null (slash command)", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("/commit");
  assert(r === null, "should not detect — slash command");
});

check("Long technical prompt → null (too long)", function() {
  var mod = loadMod();
  var long = "I already told you about the design. " + "Here is the full spec with all the details that need to be implemented including the patterns and the architecture and the testing strategy and the deployment plan and more context. ".repeat(3);
  var r = mod._detectCorrection(long);
  assert(r === null, "should not detect — too long (>500 chars)");
});

check("Prompt with code block → null (technical content)", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("No, that's wrong. Use this instead:\n```\nconst x = 1;\n```");
  assert(r === null, "should not detect — has code block");
});

check("'Read the README for setup instructions' → null (task verb)", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Read the README for setup instructions");
  assert(r === null, "should not detect — task verb 'read'");
});

check("'Fix the alignment issue in CSS' → null (fix task, not correction)", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Fix the alignment issue in the CSS file");
  assert(r === null, "should not detect — fix task");
});

check("'Review the pull request' → null (task verb)", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("Review the pull request and leave comments");
  assert(r === null, "should not detect — task verb");
});

// --- isExcluded tests ---

check("isExcluded: long text (>500 chars) → true", function() {
  var mod = loadMod();
  assert(mod._isExcluded("a".repeat(501)));
});

check("isExcluded: code block → true", function() {
  var mod = loadMod();
  assert(mod._isExcluded("Here is code:\n```\nx = 1\n```"));
});

check("isExcluded: slash command → true", function() {
  var mod = loadMod();
  assert(mod._isExcluded("/commit"));
});

check("isExcluded: task verb 'build' → true", function() {
  var mod = loadMod();
  assert(mod._isExcluded("build the new feature"));
});

check("isExcluded: task verb 'deploy' → true", function() {
  var mod = loadMod();
  assert(mod._isExcluded("deploy to production"));
});

check("isExcluded: 'fix the bug' → true", function() {
  var mod = loadMod();
  assert(mod._isExcluded("fix the bug in auth module"));
});

check("isExcluded: 'fix what you did' → false (correction about Claude)", function() {
  var mod = loadMod();
  assert(!mod._isExcluded("fix what you did wrong"));
});

check("isExcluded: greeting → true", function() {
  var mod = loadMod();
  assert(mod._isExcluded("hello claude"));
});

check("isExcluded: short correction → false", function() {
  var mod = loadMod();
  assert(!mod._isExcluded("No, that's wrong"));
});

check("isExcluded: normal text → false", function() {
  var mod = loadMod();
  assert(!mod._isExcluded("The module should return null for this case"));
});

// --- Edge cases ---

check("Empty string → null", function() {
  var mod = loadMod();
  assert(mod._detectCorrection("") === null);
});

check("Null → null", function() {
  var mod = loadMod();
  assert(mod._detectCorrection(null) === null);
});

check("Undefined → null", function() {
  var mod = loadMod();
  assert(mod._detectCorrection(undefined) === null);
});

check("'No external dependencies' → null (starts with task-excluded 'No' but is technical)", function() {
  // This tests that 'no' at the start requires a correction-like continuation
  var mod = loadMod();
  var r = mod._detectCorrection("No external dependencies should be added");
  // 'No' followed by 'external' — not in the correction continuation list
  assert(r === null, "should not detect — 'no external' is technical");
});

check("'No changes needed' → null (not a correction continuation)", function() {
  var mod = loadMod();
  var r = mod._detectCorrection("No changes needed for this file");
  assert(r === null, "should not detect");
});

check("Module function with HOOK_RUNNER_TEST → null", function() {
  var mod = loadMod();
  process.env.HOOK_RUNNER_TEST = "1";
  var r = mod({ tool_name: "Bash", tool_input: {}, tool_result: "ok" });
  assert(r === null, "should skip in test mode");
  delete process.env.HOOK_RUNNER_TEST;
});

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
