#!/usr/bin/env node
// Self-review: analyzes gate files for common problems using Haiku.
// Run: node scripts/self-review-gates.js [path-to-gate]
// Without args: reviews all gates in 1-haiku/
"use strict";

var fs = require("fs");
var path = require("path");
var haiku = require(path.join(process.env.HOME || "/home/ubu", ".claude", "hooks", "haiku-client"));

var HOME = process.env.HOME || "/home/ubu";
var HAIKU_DIR = path.join(HOME, ".claude", "hooks", "run-modules", "Stop", "1-haiku");

var targetFile = process.argv[2];
var files = targetFile
  ? [targetFile]
  : fs.readdirSync(HAIKU_DIR).filter(function(f) { return f.endsWith(".js"); }).map(function(f) { return path.join(HAIKU_DIR, f); });

var issues = [];

files.forEach(function(fp) {
  var content = fs.readFileSync(fp, "utf-8");
  var name = path.basename(fp);
  console.log("Reviewing: " + name + " (" + content.split("\n").length + " lines)");

  // Mechanical checks (no LLM needed)
  var moduleExports = content.slice(content.indexOf("module.exports"));
  var nullReturns = (moduleExports.match(/return null/g) || []).length;
  if (nullReturns > 0) {
    issues.push({ file: name, type: "null-return", detail: nullReturns + " null returns in module.exports — each one is invisible in TUI" });
  }

  if (/\.length\s*<\s*\d+/.test(moduleExports)) {
    var threshold = moduleExports.match(/\.length\s*<\s*(\d+)/);
    issues.push({ file: name, type: "arbitrary-threshold", detail: "Length threshold: " + (threshold ? threshold[0] : "?") + " — short responses are valid" });
  }

  if (/dedup|hasRecentMandate/.test(moduleExports)) {
    issues.push({ file: name, type: "dedup-logic", detail: "Contains dedup/mandate-skip — prevents fresh analysis each stop" });
  }

  if (!/process\.stderr/.test(content) && !/run-stop\.js/.test(fp)) {
    issues.push({ file: name, type: "no-stderr", detail: "No stderr write — output may not be visible in TUI" });
  }

  // Haiku analysis (deeper check)
  var prompt = [
    "Review this Claude Code gate module for problems. Focus on:",
    "1. Any code path that returns null (invisible to user)",
    "2. Arbitrary thresholds that skip analysis",
    "3. Error handling that fails silently",
    "4. Logic that prevents the gate from firing",
    "5. Missing stderr writes (TUI visibility)",
    "",
    "File: " + name,
    "Code:",
    content.slice(0, 2000),
    "",
    "Reply JSON: {\"issues\": [{\"line\": N, \"problem\": \"description\", \"fix\": \"what to do\"}], \"verdict\": \"ok|needs-fix\"}"
  ].join("\n");

  var result = haiku.call({ prompt: prompt, caller: "self-review", jsonMode: true, maxTokens: 500, timeoutMs: 15000 });
  if (result.ok && result.parsed) {
    if (result.parsed.verdict === "needs-fix" && result.parsed.issues) {
      result.parsed.issues.forEach(function(issue) {
        issues.push({ file: name, type: "haiku-found", detail: "Line " + issue.line + ": " + issue.problem + " → " + issue.fix });
      });
    }
  }
});

console.log("\n=== SELF-REVIEW RESULTS ===");
if (issues.length === 0) {
  console.log("No issues found.");
} else {
  console.log(issues.length + " issue(s):\n");
  issues.forEach(function(i, idx) {
    console.log((idx + 1) + ". [" + i.file + "] " + i.type + ": " + i.detail);
  });
}
