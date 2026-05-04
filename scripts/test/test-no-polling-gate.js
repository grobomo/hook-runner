#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/no-polling-gate.js"));

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}
function blocks(cmd) {
  var r = gate({tool_name: "Bash", tool_input: {command: cmd}});
  return r && r.decision === "block";
}
function passes(cmd) {
  return gate({tool_name: "Bash", tool_input: {command: cmd}}) === null;
}

// Non-Bash ignored
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("Edit tool ignored", gate({tool_name: "Edit", tool_input: {}}) === null);

// Pattern 1: Loop-based polling blocked
ok("while+sleep+curl blocked", blocks("while true; do sleep 5; curl http://api; done"));
ok("while+sleep+gh blocked", blocks("while true; do sleep 10; gh api repos/org/repo; done"));
ok("for+sleep+kubectl blocked", blocks("for i in 1 2 3; do sleep 30; kubectl get pods; done"));
ok("while+sleep+aws blocked", blocks("while true; do sleep 60; aws ec2 describe-instances; done"));
ok("while+sleep+docker blocked", blocks("while true; do sleep 5; docker ps; done"));

// Pattern 5: until-based polling blocked
ok("until+sleep blocked", blocks("until [ -f /tmp/done ]; do sleep 5; echo waiting; done"));

// Pattern 2: GitHub comment polling (GET) blocked
ok("gh api comments blocked", blocks("gh api repos/grobomo/hook-runner/pulls/1/comments"));

// Pattern 2: GitHub comment POST allowed
ok("gh api comments POST passes", passes("gh api repos/grobomo/hook-runner/pulls/1/comments --method POST -f body=hello"));
ok("gh api comments -X POST passes", passes("gh api repos/grobomo/hook-runner/pulls/1/comments -X POST"));

// Pattern 3: Log tailing blocked
ok("journalctl -f blocked", blocks("journalctl -f -u myservice"));
ok("journalctl --follow blocked", blocks("journalctl --follow"));
ok("tail -f blocked", blocks("tail -f /var/log/syslog"));
ok("tail -F blocked", blocks("tail -F /var/log/app.log"));
ok("kubectl logs -f blocked", blocks("kubectl logs -f pod-name"));
ok("docker logs --follow blocked", blocks("docker logs --follow container"));

// Pattern 4: watch blocked
ok("watch command blocked", blocks("watch -n 5 kubectl get pods"));

// Non-polling commands pass
ok("single curl passes", passes("curl http://api/status"));
ok("gh api single call passes", passes("gh api repos/grobomo/hook-runner/pulls"));
ok("kubectl get passes", passes("kubectl get pods"));
ok("tail -n passes", passes("tail -n 50 /var/log/syslog"));
ok("journalctl -n passes", passes("journalctl -n 100"));
ok("docker logs (no follow) passes", passes("docker logs container --tail 50"));
ok("git status passes", passes("git status"));
ok("echo passes", passes("echo hello"));
ok("empty passes", passes(""));

// Block message quality
var r = gate({tool_name: "Bash", tool_input: {command: "while true; do sleep 5; curl http://x; done"}});
ok("block mentions tokens", r && /tokens/i.test(r.reason));
ok("block mentions webhook", r && /webhook/i.test(r.reason));
ok("block mentions alternatives", r && /ALTERNATIVES/i.test(r.reason));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
