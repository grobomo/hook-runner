#!/usr/bin/env node
// Test: blueprint-only-browser-gate blocks Selenium/Playwright/Puppeteer in Bash
"use strict";

var path = require("path");
var REPO_DIR = path.resolve(__dirname, "../..");
var MODULE = path.join(REPO_DIR, "modules/PreToolUse/blueprint-only-browser-gate.js");

process.env.HOOK_RUNNER_TEST = "1";

var gate = require(MODULE);
var pass = 0, fail = 0;

function ok(label, result, expectBlock) {
  var blocked = result && result.decision === "block";
  if (expectBlock ? blocked : !blocked) {
    console.log("  PASS: " + label);
    pass++;
  } else {
    console.log("  FAIL: " + label + " — got " + (blocked ? "BLOCKED" : "PASSED") + ", expected " + (expectBlock ? "BLOCKED" : "PASSED"));
    fail++;
  }
}

function bash(cmd) {
  return gate({ tool_name: "Bash", tool_input: { command: cmd } });
}

console.log("=== blueprint-only-browser-gate ===");

// --- Should BLOCK ---
ok("selenium import in python", bash("python3 -c 'from selenium import webdriver; ...'"), true);
ok("chromedriver launch", bash("./chromedriver --port=9515"), true);
ok("npx playwright", bash("npx playwright test"), true);
ok("pip install selenium", bash("pip install selenium"), true);
ok("npm install puppeteer", bash("npm install puppeteer"), true);
ok("npm install playwright", bash("npm install playwright"), true);
ok("npm install selenium-webdriver", bash("npm install selenium-webdriver"), true);
ok("webdriver reference", bash("node -e 'var wd = require(\"selenium-webdriver\")'"), true);
ok("require puppeteer", bash("node -e 'const p = require(\"puppeteer\")'"), true);
ok("require playwright", bash("node -e 'const { chromium } = require(\"playwright\")'"), true);
ok("geckodriver", bash("geckodriver --port=4444"), true);
ok("msedgedriver", bash("msedgedriver --port=9515"), true);
ok("cypress run", bash("npx cypress run --browser chrome"), true);
ok("python selenium script", bash("python test_selenium.py"), true); // filename contains 'selenium' — it IS browser automation
ok("python with selenium import", bash("python3 -c 'import selenium'"), true);

// --- Should PASS ---
ok("normal bash command", bash("ls -la"), false);
ok("node script", bash("node app.js"), false);
ok("git command", bash("git status"), false);
ok("npm test", bash("npm test"), false);
ok("grep for selenium references", bash("grep -r 'selenium' package.json"), false);
ok("find playwright files", bash("find . -name 'playwright*'"), false);
ok("cat README about playwright", bash("cat README.md | grep playwright"), false);
ok("check playwright version", bash("playwright --version"), false);
ok("chromedriver help", bash("chromedriver --help"), false);
ok("non-browser tool", bash("curl https://example.com"), false);
ok("docker command", bash("docker ps"), false);

// --- Block message format ---
var r = bash("pip install selenium");
var reason = (r && r.reason) || "";
function okBool(label, val) { if (val) { console.log("  PASS: " + label); pass++; } else { console.log("  FAIL: " + label); fail++; } }
okBool("block has WHY", reason.indexOf("WHY:") >= 0);
okBool("block has NEXT STEPS", reason.indexOf("NEXT STEPS:") >= 0);
okBool("block mentions Blueprint", reason.indexOf("Blueprint MCP") >= 0);

// --- Non-Bash tools pass through ---
ok("Edit tool passes", gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/test.py", new_string: "from selenium import webdriver" } }), false);
ok("Write tool passes", gate({ tool_name: "Write", tool_input: { file_path: "/tmp/test.py", content: "import puppeteer" } }), false);

console.log("\n=== Results: " + pass + " passed, " + fail + " failed ===");
process.exit(fail > 0 ? 1 : 0);
