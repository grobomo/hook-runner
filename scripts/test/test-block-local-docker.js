#!/usr/bin/env node
"use strict";
// T573: Tests for block-local-docker.js
// Blocks local Docker commands except read-only inspection (ps, logs, inspect, etc.)

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "block-local-docker.js");
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

// --- Non-docker commands pass ---

check("git command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("git status")) === null);
});

check("node command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("node app.js")) === null);
});

// --- Docker read-only commands pass ---

check("docker ps: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("docker ps")) === null);
});

check("docker images: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("docker images")) === null);
});

check("docker inspect: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("docker inspect mycontainer")) === null);
});

check("docker logs: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("docker logs mycontainer")) === null);
});

check("docker version: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("docker version")) === null);
});

check("docker info: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("docker info")) === null);
});

check("docker stats: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("docker stats")) === null);
});

// --- Docker-compose read-only commands pass ---

check("docker-compose ps: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("docker-compose ps")) === null);
});

check("docker-compose logs: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("docker-compose logs web")) === null);
});

check("docker-compose config: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("docker-compose config")) === null);
});

// --- Docker state-changing commands block ---

check("docker run: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("docker run -d nginx"));
  assert(r && r.decision === "block");
  assert(r.reason.indexOf("no-local-docker") >= 0);
});

check("docker build: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("docker build -t myimage ."));
  assert(r && r.decision === "block");
});

check("docker pull: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("docker pull ubuntu:latest"));
  assert(r && r.decision === "block");
});

check("docker push: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("docker push myimage:latest"));
  assert(r && r.decision === "block");
});

check("docker stop: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("docker stop mycontainer"));
  assert(r && r.decision === "block");
});

check("docker rm: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("docker rm mycontainer"));
  assert(r && r.decision === "block");
});

check("docker exec: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("docker exec -it container bash"));
  assert(r && r.decision === "block");
});

// --- Docker-compose state-changing commands block ---

check("docker-compose up: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("docker-compose up -d"));
  assert(r && r.decision === "block");
});

check("docker-compose down: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("docker-compose down"));
  assert(r && r.decision === "block");
});

check("docker-compose build: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("docker-compose build"));
  assert(r && r.decision === "block");
});

// --- sudo prefix: still blocks ---

check("sudo docker run: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("sudo docker run -d nginx"));
  assert(r && r.decision === "block");
});

// --- Edge cases ---

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
