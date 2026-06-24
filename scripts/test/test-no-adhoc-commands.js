#!/usr/bin/env node
"use strict";
// T573: Tests for no-adhoc-commands.js
// Blocks ad-hoc infrastructure commands (AWS, SSH, Docker, kubectl, az, terraform, etc.)
// All operations must go through reusable scripts in scripts/.

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "no-adhoc-commands.js");
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

// --- Safe dev tools pass ---

check("git status: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("git status")) === null);
});

check("npm install: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("npm install lodash")) === null);
});

check("node command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("node setup.js --test")) === null);
});

check("python command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("python script.py")) === null);
});

check("ls command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("ls -la")) === null);
});

check("cat command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("cat file.txt")) === null);
});

check("grep command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("grep -rn 'pattern' src/")) === null);
});

check("echo command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("echo hello world")) === null);
});

// --- Script paths pass ---

check("scripts/ path: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("scripts/aws/deploy.sh")) === null);
});

check("bash scripts/ path: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("bash scripts/k8s/apply.sh")) === null);
});

check("./scripts/ path: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("./scripts/fleet/api-submit.sh")) === null);
});

check("bash ./scripts/ path: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("bash ./scripts/test/run.sh")) === null);
});

check("Absolute Windows script path: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("bash C:/Projects/myapp/scripts/deploy.sh")) === null);
});

check("source scripts/: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("source scripts/fleet/config.sh")) === null);
});

check("Generic .sh file: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("bash deploy.sh")) === null);
});

// --- AWS CLI: blocks ---

check("aws ec2 describe-instances: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("aws ec2 describe-instances --profile hackathon"));
  assert(r && r.decision === "block");
  assert(/BLOCKED|ad.hoc|aws|script/i.test(r.reason));
});

check("aws s3 ls: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("aws s3 ls s3://mybucket"));
  assert(r && r.decision === "block");
});

check("aws cloudformation deploy: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("aws cloudformation deploy --template-file cf.yaml"));
  assert(r && r.decision === "block");
});

check("aws lambda invoke: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("aws lambda invoke --function-name myFunc output.json"));
  assert(r && r.decision === "block");
});

// --- SSH/SCP: blocks ---

check("ssh command: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("ssh user@host 'ls -la'"));
  assert(r && r.decision === "block");
  assert(/BLOCKED|ad.hoc|ssh|script/i.test(r.reason));
});

check("scp command: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("scp file.txt user@host:/tmp/"));
  assert(r && r.decision === "block");
});

// --- Docker (state-changing): blocks ---

check("docker run: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("docker run -d nginx"));
  assert(r && r.decision === "block");
  assert(r.reason.indexOf("AD-HOC DOCKER") >= 0);
});

check("docker exec: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("docker exec -it container bash"));
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

// --- kubectl: blocks ---

check("kubectl apply: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("kubectl apply -f deploy.yaml"));
  assert(r && r.decision === "block");
  assert(r.reason.indexOf("AD-HOC KUBECTL") >= 0);
});

check("kubectl get pods: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("kubectl get pods -n mynamespace"));
  assert(r && r.decision === "block");
});

// --- az CLI: blocks ---

check("az vm list: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("az vm list --output table"));
  assert(r && r.decision === "block");
  assert(r.reason.indexOf("AD-HOC AZ") >= 0);
});

check("az with env var prefix: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("MSYS_NO_PATHCONV=1 az storage blob list"));
  assert(r && r.decision === "block");
});

// --- terraform: blocks ---

check("terraform plan: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("terraform plan"));
  assert(r && r.decision === "block");
  assert(r.reason.indexOf("AD-HOC TERRAFORM") >= 0);
});

check("terraform with env prefix: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("TF_VAR_foo=bar terraform apply"));
  assert(r && r.decision === "block");
});

// --- azcopy: blocks ---

check("azcopy command: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("azcopy copy source dest"));
  assert(r && r.decision === "block");
  assert(r.reason.indexOf("AD-HOC AZCOPY") >= 0);
});

// --- curl: localhost passes, external blocks ---

check("curl localhost: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("curl http://localhost:8080/api")) === null);
});

check("curl 127.0.0.1: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("curl http://127.0.0.1:3000/health")) === null);
});

check("curl external host: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("curl https://api.example.com/data"));
  assert(r && r.decision === "block");
  assert(/BLOCKED|ad.hoc|curl|script/i.test(r.reason));
});

// --- RDP/Windows infra: blocks ---

check("mstsc: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("mstsc /v:10.0.0.1"));
  assert(r && r.decision === "block");
  assert(r.reason.indexOf("AD-HOC RDP") >= 0);
});

check("cmdkey: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("cmdkey /add:server /user:admin /pass:secret"));
  assert(r && r.decision === "block");
});

// --- PowerShell infra: blocks ---

check("powershell.exe with Set-ItemProperty: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('powershell.exe -Command "Set-ItemProperty HKLM:\\path -Name x -Value y"'));
  assert(r && r.decision === "block");
  assert(r.reason.indexOf("AD-HOC POWERSHELL") >= 0);
});

check("powershell.exe simple command: passes (no infra patterns)", function() {
  // powershell.exe without infra patterns isn't explicitly blocked by the gate
  // It doesn't match any blocked pattern so it falls through to return null
  var gate = loadGate();
  assert(gate(makeInput('powershell.exe -Command "Get-Date"')) === null);
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
