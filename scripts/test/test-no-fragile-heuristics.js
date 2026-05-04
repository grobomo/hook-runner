#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/no-fragile-heuristics.js"));

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

// Non-Edit/Write ignored
ok("Read ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("Bash ignored", gate({tool_name: "Bash", tool_input: {}}) === null);

// Heuristic patterns in verification scripts blocked
function editVerify(content) {
  return gate({tool_name: "Edit", tool_input: {file_path: "/review-quality.py", new_string: content}});
}
function writeVerify(content) {
  return gate({tool_name: "Write", tool_input: {file_path: "/check-screenshot.py", content: content}});
}

var r1 = editVerify("white_ratio = pixels / total");
ok("pixel ratio blocked", r1 && r1.decision === "block");

var r2 = writeVerify("unique_colors = len(set(image.getdata()))");
ok("color count blocked", r2 && r2.decision === "block");

var r3 = editVerify("img.convert('RGB').getpixel((0,0))");
ok("getpixel blocked", r3 && r3.decision === "block");

var r4 = writeVerify("if white_ish > 0.95: blank = True");
ok("white_ish blocked", r4 && r4.decision === "block");

var r5 = writeVerify("colors = img.quantize(colors=16)");
ok("quantize color blocked", r5 && r5.decision === "block");

// Non-verification scripts allowed
var r6 = gate({tool_name: "Edit", tool_input: {file_path: "/src/image-processor.py", new_string: "white_ratio = 0.5"}});
ok("non-verify script allowed", r6 === null);

// Normal content in verification scripts allowed
var r7 = editVerify("result = analyze_report(data)");
ok("normal content allowed", r7 === null);

// Block message quality
ok("block mentions claude -p", r1 && /claude.*-p|Anthropic SDK/i.test(r1.reason));
ok("block mentions fragile", r1 && /fragile/i.test(r1.reason));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
