#!/usr/bin/env node
"use strict";
// Tests for T636: _haiku-judge.js shared helper
// Tests fallback behavior, health caching, timeout handling
var http = require("http");
var path = require("path");

var PASS = 0, FAIL = 0;
function pass(msg) { console.log("  PASS: " + msg); PASS++; }
function fail(msg) { console.log("  FAIL: " + msg); FAIL++; }

console.log("=== hook-runner: _haiku-judge helper (T636) ===");

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "PreToolUse", "_haiku-judge.js");

function freshJudge(port) {
  delete require.cache[require.resolve(MOD_PATH)];
  process.env.JUDGE_URL = "http://127.0.0.1:" + port;
  return require(MOD_PATH);
}

// --- Test 1: Fallback when no server is running ---
(async function() {
  var judge = freshJudge(59999); // port nothing listens on
  judge._resetCache();
  var result = await judge({ question: "test", gate: "test-gate", fallback: "allow" });
  if (result.fallback_used && result.allow === true) {
    pass("Fallback allow when server unreachable");
  } else {
    fail("Fallback allow when server unreachable: " + JSON.stringify(result));
  }

  // --- Test 2: Fallback "block" mode ---
  judge._resetCache();
  var result2 = await judge({ question: "test", gate: "test-gate", fallback: "block" });
  if (result2.fallback_used && result2.allow === false) {
    pass("Fallback block when server unreachable");
  } else {
    fail("Fallback block when server unreachable: " + JSON.stringify(result2));
  }

  // --- Test 3: Health check caching (doesn't re-check within TTL) ---
  // _available is already false from test 1/2, and lastCheck is recent
  var start = Date.now();
  var result3 = await judge({ question: "test", gate: "test-gate", fallback: "allow" });
  var elapsed = Date.now() - start;
  if (result3.fallback_used && elapsed < 100) {
    pass("Health check cached (no network call): " + elapsed + "ms");
  } else {
    fail("Health check should be cached: elapsed=" + elapsed + "ms, " + JSON.stringify(result3));
  }

  // --- Test 4: Mock server returns allow ---
  var server = http.createServer(function(req, res) {
    if (req.url === "/health") {
      res.writeHead(200);
      res.end("ok");
      return;
    }
    if (req.url === "/judge") {
      var body = "";
      req.on("data", function(c) { body += c; });
      req.on("end", function() {
        var input = JSON.parse(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ allow: true, reason: "looks good", confidence: 0.95 }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise(function(resolve) { server.listen(0, resolve); });
  var port = server.address().port;

  var judge2 = freshJudge(port);
  judge2._resetCache();
  var result4 = await judge2({ question: "Is this ok?", context: "test", gate: "test-gate", fallback: "allow" });
  if (result4.allow === true && result4.reason === "looks good" && !result4.fallback_used) {
    pass("Mock server returns allow with reason");
  } else {
    fail("Mock server allow: " + JSON.stringify(result4));
  }

  // --- Test 5: Mock server returns block ---
  server.close();
  var server2 = http.createServer(function(req, res) {
    if (req.url === "/health") { res.writeHead(200); res.end("ok"); return; }
    if (req.url === "/judge") {
      var body = "";
      req.on("data", function(c) { body += c; });
      req.on("end", function() {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ allow: false, reason: "not in scope", confidence: 0.8 }));
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise(function(resolve) { server2.listen(0, resolve); });
  var port2 = server2.address().port;

  var judge3 = freshJudge(port2);
  judge3._resetCache();
  var result5 = await judge3({ question: "Is this ok?", context: "test", gate: "scope-gate", fallback: "allow" });
  if (result5.allow === false && result5.reason === "not in scope" && !result5.fallback_used) {
    pass("Mock server returns block with reason");
  } else {
    fail("Mock server block: " + JSON.stringify(result5));
  }

  // --- Test 6: 404 from /judge → graceful fallback (endpoint not deployed yet) ---
  server2.close();
  var server3 = http.createServer(function(req, res) {
    if (req.url === "/health") { res.writeHead(200); res.end("ok"); return; }
    res.writeHead(404); res.end("not found");
  });
  await new Promise(function(resolve) { server3.listen(0, resolve); });
  var port3 = server3.address().port;

  var judge4 = freshJudge(port3);
  judge4._resetCache();
  var result6 = await judge4({ question: "test", gate: "test", fallback: "allow" });
  if (result6.fallback_used && result6.allow === true) {
    pass("404 from /judge → graceful fallback (allow)");
  } else {
    fail("404 fallback: " + JSON.stringify(result6));
  }

  // --- Test 7: Payload includes gate and project fields ---
  server3.close();
  var receivedPayload = null;
  var server4 = http.createServer(function(req, res) {
    if (req.url === "/health") { res.writeHead(200); res.end("ok"); return; }
    if (req.url === "/judge") {
      var body = "";
      req.on("data", function(c) { body += c; });
      req.on("end", function() {
        receivedPayload = JSON.parse(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ allow: true, reason: "ok" }));
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise(function(resolve) { server4.listen(0, resolve); });
  var port4 = server4.address().port;

  var judge5 = freshJudge(port4);
  judge5._resetCache();
  process.env.CLAUDE_PROJECT_DIR = "/tmp/my-project";
  await judge5({ question: "scope check", context: "editing app.js", gate: "spec-gate", fallback: "block" });
  server4.close();

  if (receivedPayload && receivedPayload.gate === "spec-gate" && receivedPayload.project === "my-project" &&
      receivedPayload.question === "scope check" && receivedPayload.context === "editing app.js") {
    pass("Payload includes gate, project, question, context");
  } else {
    fail("Payload fields: " + JSON.stringify(receivedPayload));
  }

  // --- Test 8: latency_ms is populated ---
  if (result4.latency_ms > 0) {
    pass("latency_ms populated: " + result4.latency_ms + "ms");
  } else {
    fail("latency_ms should be > 0: " + result4.latency_ms);
  }

  console.log("\n=== Results: " + PASS + " passed, " + FAIL + " failed ===");
  process.exit(FAIL > 0 ? 1 : 0);
})();
