#!/usr/bin/env node
"use strict";
// T776: Session Inbox — makes Claude Code sessions API-addressable
//
// Each session starts a tiny HTTP server on a dynamic port.
// Registers with fleet API at :4100. Other sessions can POST prompts to it.
// The prompt is written to a file that the UserPromptSubmit hook picks up.
//
// Usage:
//   node src/session-inbox.js                  # start inbox server
//   node src/session-inbox.js --send <port> "do X"   # send prompt to another session
//
// Architecture:
//   Session A starts inbox on :4110
//   Session A registers with fleet: POST /api/fleet/register {port: 4110, project: "hook-runner"}
//   Session B wants A to do something: POST http://127.0.0.1:4110/inbox {prompt: "check TODO.md"}
//   Session A's inbox writes prompt to ~/.claude/hooks/inbox/{session}.prompt
//   Session A's UserPromptSubmit hook reads and injects the prompt
//
// Port allocation: starts at 4110, increments until a free port is found.

var http = require("http");
var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var SESSION_ID = process.env.CLAUDE_SESSION_ID || "unknown-" + process.pid;
var PROJECT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
var PROJECT_NAME = path.basename(PROJECT);
var INBOX_DIR = path.join(HOME, ".claude", "hooks", "inbox");
var FLEET_URL = "http://127.0.0.1:4100";

try { fs.mkdirSync(INBOX_DIR, { recursive: true }); } catch (e) {}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data) + "\n");
}

// Register with fleet API
function registerWithFleet(port) {
  var payload = JSON.stringify({
    session_id: SESSION_ID,
    project: PROJECT_NAME,
    cwd: PROJECT,
    inbox_port: port,
    status: "active",
    ts: new Date().toISOString()
  });
  var req = http.request(FLEET_URL + "/api/fleet/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
  });
  req.on("error", function() {}); // Fleet may not support this yet — that's OK
  req.write(payload);
  req.end();
}

// Write prompt to inbox file for pickup
function writePrompt(prompt, from) {
  var entry = {
    ts: new Date().toISOString(),
    from: from || "api",
    prompt: prompt,
    status: "pending"
  };
  var promptFile = path.join(INBOX_DIR, SESSION_ID.slice(0, 8) + ".jsonl");
  fs.appendFileSync(promptFile, JSON.stringify(entry) + "\n");
  return promptFile;
}

// Read pending prompts
function readPending() {
  var promptFile = path.join(INBOX_DIR, SESSION_ID.slice(0, 8) + ".jsonl");
  if (!fs.existsSync(promptFile)) return [];
  var lines = fs.readFileSync(promptFile, "utf-8").trim().split("\n");
  return lines.map(function(l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean)
    .filter(function(e) { return e.status === "pending"; });
}

// Server
var server = http.createServer(function(req, res) {
  if (req.url === "/ping") return json(res, 200, { ok: true, session: SESSION_ID.slice(0, 8), project: PROJECT_NAME });

  if (req.url === "/inbox" && req.method === "POST") {
    var body = "";
    req.on("data", function(chunk) { body += chunk; });
    req.on("end", function() {
      try {
        var data = JSON.parse(body);
        var prompt = data.prompt || data.message || data.text || "";
        if (!prompt) return json(res, 400, { error: "no prompt provided" });
        var file = writePrompt(prompt, data.from || "api");
        return json(res, 200, { ok: true, queued: true, file: file });
      } catch (e) {
        return json(res, 400, { error: "invalid JSON" });
      }
    });
    return;
  }

  if (req.url === "/inbox" && req.method === "GET") {
    return json(res, 200, { pending: readPending() });
  }

  json(res, 404, { endpoints: ["GET /ping", "POST /inbox", "GET /inbox"] });
});

// Find free port starting at 4110
function findPort(start, cb) {
  var s = http.createServer();
  s.listen(start, "127.0.0.1", function() {
    s.close(function() { cb(start); });
  });
  s.on("error", function() { findPort(start + 1, cb); });
}

// CLI: --send mode
if (process.argv[2] === "--send") {
  var targetPort = parseInt(process.argv[3], 10);
  var prompt = process.argv.slice(4).join(" ");
  if (!targetPort || !prompt) {
    console.error("Usage: node session-inbox.js --send <port> <prompt>");
    process.exit(1);
  }
  var payload = JSON.stringify({ prompt: prompt, from: PROJECT_NAME + "/" + SESSION_ID.slice(0, 8) });
  var req = http.request("http://127.0.0.1:" + targetPort + "/inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
  }, function(res) {
    var body = "";
    res.on("data", function(c) { body += c; });
    res.on("end", function() { console.log(body); });
  });
  req.on("error", function(e) { console.error("Failed:", e.message); process.exit(1); });
  req.write(payload);
  req.end();
} else {
  // Start server
  findPort(4110, function(port) {
    server.listen(port, "127.0.0.1", function() {
      console.log("Session inbox on http://127.0.0.1:" + port);
      console.log("Session: " + SESSION_ID.slice(0, 8) + " | Project: " + PROJECT_NAME);
      registerWithFleet(port);

      // Write port file so other processes can find us
      var portFile = path.join(INBOX_DIR, SESSION_ID.slice(0, 8) + ".port");
      fs.writeFileSync(portFile, String(port));
    });
  });
}
