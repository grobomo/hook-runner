#!/usr/bin/env node
"use strict";
// T572: Tests for messaging-safety-gate.js
// Blocks outbound messaging (email, Teams, meetings) unless target is authorized.

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "messaging-safety-gate.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function makeInput(cmd) {
  return { tool_name: "Bash", tool_input: { command: cmd } };
}

// --- Non-Bash tools pass ---

check("Non-Bash tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "x" } }) === null);
});

check("Read tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "x" } }) === null);
});

// --- Non-messaging Bash commands pass ---

check("Bash non-messaging command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("ls -la")) === null);
});

check("Bash git command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("git status")) === null);
});

check("Bash npm command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("npm install lodash")) === null);
});

// --- Teams chat send: blocked without allowed chat ID ---

check("teams_chat.py send to unknown chat: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('python teams_chat.py send --chat-id "19:unknown@thread.v2" --message "hi"'));
  assert(r && r.decision === "block", "should block");
  assert(/BLOCKED|messag|send/i.test(r.reason), "should mention blocking message send");
});

check("teams_chat.py send to allowed hackathon chat: passes", function() {
  var gate = loadGate();
  var r = gate(makeInput('python teams_chat.py send --chat-id "19:cf504fc638964747bff028e4ba785869@thread.v2" --message "hi"'));
  assert(r === null, "should pass for allowed chat");
});

// --- Graph API sendMail ---

check("graph_post sendMail: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('python graph_post.py sendMail --to user@example.com'));
  assert(r && r.decision === "block");
});

// --- Graph API messages ---

check("graph_post messages to unknown chat: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('python graph_post.py messages --chat "19:unknown@thread.v2"'));
  assert(r && r.decision === "block");
});

check("graph_post messages to allowed chat: passes", function() {
  var gate = loadGate();
  var r = gate(makeInput('python graph_post.py messages --chat "19:cf504fc638964747bff028e4ba785869@thread.v2"'));
  assert(r === null);
});

// --- Calendar events (graph_post events) ---

check("graph_post events: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('python graph_post.py events --title "standup"'));
  assert(r && r.decision === "block");
});

// --- Meeting scheduler ---

check("schedule.py create: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('python schedule.py create --title "sync" --attendees user@example.com'));
  assert(r && r.decision === "block");
});

// --- SMTP send ---

check("smtp send: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('python smtp_relay.py send --to user@example.com'));
  assert(r && r.decision === "block");
});

check("SMTP Send (case insensitive): blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('python SMTP_tool.py Send --to admin@corp.com'));
  assert(r && r.decision === "block");
});

// --- Edge cases ---

check("teams_chat.py list (not send): passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("python teams_chat.py list")) === null);
});

check("teams_chat.py read (not send): passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("python teams_chat.py read --chat-id 19:abc@thread.v2")) === null);
});

check("teams_chat.py members (not send): passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("python teams_chat.py members")) === null);
});

check("Empty command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("")) === null);
});

check("Missing tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash" }) === null);
});

// --- Summary ---
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
