#!/usr/bin/env node
"use strict";
// T574: Tests for aws-tagging-gate.js
// Enforces Project=hackathon26 tag on AWS resource creation with --profile hackathon.

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "aws-tagging-gate.js");
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

// --- Non-hackathon profile: passes ---

check("AWS command without --profile hackathon: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("aws ec2 run-instances --profile default --image-id ami-123")) === null);
});

check("AWS command with no profile: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("aws s3 ls")) === null);
});

// --- Non-create commands with hackathon profile: passes ---

check("aws s3 ls with hackathon: passes (not a create command)", function() {
  var gate = loadGate();
  assert(gate(makeInput("aws s3 ls --profile hackathon")) === null);
});

check("aws ec2 describe-instances with hackathon: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("aws ec2 describe-instances --profile hackathon")) === null);
});

// --- Create commands WITHOUT tags: blocks ---

check("ec2 run-instances without tag: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("aws ec2 run-instances --profile hackathon --image-id ami-123"));
  assert(r && r.decision === "block");
  assert(r.reason.indexOf("Project=hackathon26") >= 0);
});

check("cloudformation create-stack without tag: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("aws cloudformation create-stack --profile hackathon --stack-name test"));
  assert(r && r.decision === "block");
});

check("cloudformation deploy without tag: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("aws cloudformation deploy --profile hackathon --template-file cf.yaml"));
  assert(r && r.decision === "block");
});

check("s3api create-bucket without tag: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("aws s3api create-bucket --profile hackathon --bucket my-bucket"));
  assert(r && r.decision === "block");
});

check("lambda create-function without tag: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("aws lambda create-function --profile hackathon --function-name test"));
  assert(r && r.decision === "block");
});

check("ec2 create-security-group without tag: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("aws ec2 create-security-group --profile hackathon --group-name test"));
  assert(r && r.decision === "block");
});

check("iam create-role without tag: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("aws iam create-role --profile hackathon --role-name test"));
  assert(r && r.decision === "block");
});

check("ecs create-cluster without tag: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("aws ecs create-cluster --profile hackathon --cluster-name test"));
  assert(r && r.decision === "block");
});

check("ecr create-repository without tag: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("aws ecr create-repository --profile hackathon --repository-name test"));
  assert(r && r.decision === "block");
});

// --- Create commands WITH proper tag: passes ---

check("ec2 run-instances with Key=Project,Value=hackathon26: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("aws ec2 run-instances --profile hackathon --image-id ami-123 --tags Key=Project,Value=hackathon26")) === null);
});

check("cloudformation deploy with Project=hackathon26 in params: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput('aws cloudformation deploy --profile hackathon --tags Project=hackathon26')) === null);
});

check("JSON-style tag: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput('aws ec2 run-instances --profile hackathon --tag-specifications \'{"Project": "hackathon26"}\'')) === null);
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
