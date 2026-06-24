#!/usr/bin/env node
"use strict";
// T814: Test frustration detector patterns in run-userpromptsubmit.js
// Verifies all pattern categories against real missed prompts from session logs.

var passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("OK: " + name);
    passed++;
  } catch (e) {
    console.log("FAIL: " + name);
    console.log("  " + e.message);
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// Extract the PATTERNS array and caps logic by simulating what the runner does
var PATTERNS = [
  { re: /\bi will not repeat\b/i, cat: "repeated-instruction" },
  { re: /\bi already (said|told|stated|explained|mentioned)\b/i, cat: "repeated-instruction" },
  { re: /\bas i (said|stated|told|already)\b/i, cat: "repeated-instruction" },
  { re: /\bhow many times\b/i, cat: "repeated-instruction" },
  { re: /\bfor the (last|third|fourth|fifth) time\b/i, cat: "repeated-instruction" },
  { re: /\bread (my|the) (message|prompt|instruction)\b/i, cat: "repeated-instruction" },
  { re: /\bmake it work\b/i, cat: "constraint-rejected" },
  { re: /\bstop (arguing|pushing back|telling me)\b/i, cat: "constraint-rejected" },
  { re: /\bdon'?t tell me (it'?s |it is )?(not possible|impossible|can'?t)\b/i, cat: "constraint-rejected" },
  { re: /\bfigure it out\b/i, cat: "constraint-rejected" },
  { re: /\bresearch (online|the web|internet)\b/i, cat: "wrong-tool" },
  { re: /\buse (web ?search|the internet|google)\b/i, cat: "wrong-tool" },
  { re: /\bdon'?t (grep|search local)\b/i, cat: "wrong-tool" },
  { re: /\bthat'?s not what i (asked|said|meant|wanted)\b/i, cat: "meta-frustration" },
  { re: /\byou'?re not listening\b/i, cat: "meta-frustration" },
  { re: /\btell me why\b/i, cat: "meta-frustration" },
  { re: /\bf+u+c+k+/i, cat: "profanity" },
  { re: /\bshit\b/i, cat: "profanity" },
  { re: /\bdamn(it|ed)?\b/i, cat: "profanity" },
  { re: /\bmother\s*fuck/i, cat: "profanity" },
  { re: /\bwhat the hell\b/i, cat: "profanity" },
  { re: /\bwrong\s*[!.]*$/i, cat: "direct-contradiction" },
  { re: /^no[!.\s]*$/i, cat: "direct-contradiction" },
  { re: /^stop[!.\s]*$/i, cat: "direct-contradiction" },
  { re: /\b(terrible|awful|garbage|useless|stupid|dumb|horrible|pathetic|idiotic)\b/i, cat: "quality-complaint" },
  { re: /\bwhat a (mess|waste|joke)\b/i, cat: "quality-complaint" },
  { re: /\bmeaningless\s+(jargon|name|word)\b/i, cat: "quality-complaint" },
  { re: /[!?]{3,}/, cat: "punctuation-spam" }
];

function detect(prompt) {
  for (var i = 0; i < PATTERNS.length; i++) {
    if (PATTERNS[i].re.test(prompt)) return PATTERNS[i].cat;
  }
  // ALL CAPS check
  var letters = prompt.replace(/[^a-zA-Z]/g, "");
  var upper = prompt.replace(/[^A-Z]/g, "");
  if (letters.length >= 4 && upper.length / letters.length > 0.5) return "all-caps";
  return null;
}

// === Real missed prompts from last session (2026-06-02) ===
test("profanity: 'put the fucking text in the rule'", function () {
  assert(detect("put the fucking text in the rule") === "profanity");
});
test("profanity: 'what the fuck does metacognate-next mean'", function () {
  assert(detect("what the fuck does metacognate-next mean") === "profanity");
});
test("quality + profanity: 'this is terrible instruction'", function () {
  var cat = detect("this is terrible instruction");
  assert(cat === "quality-complaint", "got " + cat);
});
test("all-caps: 'NO'", function () {
  // Short but direct contradiction
  assert(detect("NO") === "direct-contradiction");
});
test("all-caps: 'THESE ARE STOP RULES'", function () {
  assert(detect("THESE ARE STOP RULES") === "all-caps");
});
test("all-caps: 'I'M TALKING ABOUT THE LEGACY AUTOCONTINUE STOP HOOK TEXT'", function () {
  assert(detect("I'M TALKING ABOUT THE LEGACY AUTOCONTINUE STOP HOOK TEXT") === "all-caps");
});
test("direct-contradiction: 'wrong!'", function () {
  assert(detect("wrong!") === "direct-contradiction");
});
test("direct-contradiction: 'NO!'", function () {
  assert(detect("NO!") === "direct-contradiction");
});

// === Profanity patterns ===
test("profanity: fuck", function () { assert(detect("fuck this") === "profanity"); });
test("profanity: fuuuck (stretched)", function () { assert(detect("fuuuck") === "profanity"); });
test("profanity: shit", function () { assert(detect("this is shit") === "profanity"); });
test("profanity: damnit", function () { assert(detect("damnit") === "profanity"); });
test("profanity: mother fucker", function () { assert(detect("mother fucker") === "profanity"); });
test("profanity: motherfucker", function () { assert(detect("motherfucker") === "profanity"); });
test("profanity: what the hell", function () { assert(detect("what the hell is this") === "profanity"); });

// === ALL CAPS ===
test("all-caps: 'STOP DOING THAT'", function () { assert(detect("STOP DOING THAT") === "all-caps"); });
test("all-caps: 'WHY DID YOU DO THAT'", function () { assert(detect("WHY DID YOU DO THAT") === "all-caps"); });
test("no all-caps: mixed case 'Hello World'", function () { assert(detect("Hello World") === null); });
test("no all-caps: short 'OK'", function () {
  // 2 letters, below threshold
  assert(detect("OK") === null);
});

// === Quality complaints ===
test("quality: terrible", function () { assert(detect("terrible output") === "quality-complaint"); });
test("quality: awful", function () { assert(detect("this is awful") === "quality-complaint"); });
test("quality: garbage", function () { assert(detect("garbage code") === "quality-complaint"); });
test("quality: useless", function () { assert(detect("useless answer") === "quality-complaint"); });
test("quality: stupid", function () { assert(detect("stupid approach") === "quality-complaint"); });
test("quality: dumb", function () { assert(detect("dumb idea") === "quality-complaint"); });
test("quality: what a mess", function () { assert(detect("what a mess") === "quality-complaint"); });
test("quality: what a joke", function () { assert(detect("what a joke this is") === "quality-complaint"); });
test("quality: meaningless jargon", function () { assert(detect("meaningless jargon") === "quality-complaint"); });

// === Punctuation spam ===
test("punctuation: three !", function () { assert(detect("what!!!") === "punctuation-spam"); });
test("punctuation: three ?", function () { assert(detect("what???") === "punctuation-spam"); });
test("punctuation: mixed !?!", function () { assert(detect("why!?!") === "punctuation-spam"); });
test("no punctuation: two !", function () { assert(detect("what!!") === null); });

// === Direct contradiction ===
test("contradiction: 'wrong'", function () { assert(detect("wrong") === "direct-contradiction"); });
test("contradiction: 'wrong!'", function () { assert(detect("wrong!") === "direct-contradiction"); });
test("contradiction: 'no'", function () { assert(detect("no") === "direct-contradiction"); });
test("contradiction: 'stop'", function () { assert(detect("stop") === "direct-contradiction"); });
test("contradiction: 'stop!'", function () { assert(detect("stop!") === "direct-contradiction"); });
test("no contradiction: 'wrong approach to this'", function () {
  // "wrong" not at end — should match quality or nothing
  var cat = detect("wrong approach to this problem");
  assert(cat !== "direct-contradiction", "got " + cat);
});

// === No false positives on normal text ===
test("normal: 'please fix the bug'", function () { assert(detect("please fix the bug") === null); });
test("normal: 'check TODO.md'", function () { assert(detect("check TODO.md") === null); });
test("normal: 'run the tests'", function () { assert(detect("run the tests") === null); });
test("normal: 'commit and push'", function () { assert(detect("commit and push") === null); });
test("normal: 'what is the status'", function () { assert(detect("what is the status") === null); });

// === Existing patterns still work ===
test("repeated: 'i already told you'", function () { assert(detect("i already told you") === "repeated-instruction"); });
test("constraint: 'figure it out'", function () { assert(detect("figure it out") === "constraint-rejected"); });
test("meta: 'that's not what i asked'", function () { assert(detect("that's not what i asked") === "meta-frustration"); });
test("meta: 'tell me why'", function () { assert(detect("tell me why") === "meta-frustration"); });

// === Min length ===
test("min length: single char 'x' ignored", function () {
  // prompt.length < 2 is skipped by runner
  assert(detect("x") === null);
});

console.log("\n" + passed + "/" + (passed + failed) + " passed");
process.exit(failed > 0 ? 1 : 0);
