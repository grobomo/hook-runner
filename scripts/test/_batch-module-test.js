#!/usr/bin/env node
// Quick batch module test — runs all modules in a single process
"use strict";
process.env.HOOK_RUNNER_TEST = "1";
var fs = require("fs"), path = require("path");
var modsDir = path.join(__dirname, "..", "..", "modules");
var events = fs.readdirSync(modsDir).filter(function(d) {
  return fs.statSync(path.join(modsDir, d)).isDirectory();
});
var failures = [], total = 0;

// Helper files (underscore prefix) are utility modules, not gates.
// They export functions but don't follow the gate contract (return null or {decision:"block"}).
// Validate that they export a function and don't throw on basic input.
function testHelper(event, name, filePath) {
  total++;
  try {
    delete require.cache[require.resolve(filePath)];
    var m = require(filePath);
    // Helpers can export functions, arrays, or objects — just verify they load
    if (m === null || m === undefined) { failures.push(event + "/" + name + ": helper exports nothing"); return; }
    // If it's a function, call with a safe default arg
    if (typeof m === "function") m(0);
  } catch(e) {
    failures.push(event + "/" + name + ": helper threw: " + e.message.split("\n")[0]);
  }
}

function testModule(event, name, filePath) {
  total++;
  try {
    delete require.cache[require.resolve(filePath)];
    var m = require(filePath);
    if (typeof m !== "function") { failures.push(event + "/" + name + ": not a function"); return; }
    var input;
    if (event === "PreToolUse") input = {tool_name:"Bash",tool_input:{command:"echo hello"}};
    else if (event === "PostToolUse") input = {tool_name:"Edit",tool_input:{file_path:"/tmp/test.js",old_string:"a",new_string:"b"}};
    else if (event === "Stop") input = {session_id:"test",stop_hook_active:true};
    else if (event === "SessionStart") input = {session_id:"test"};
    else if (event === "UserPromptSubmit") input = {prompt:"hello"};
    else input = {};
    var r = m(input);
    if (r && typeof r.then === "function") return; // async ok
    var type = r === null ? "null" : typeof r;
    if (type !== "null" && type !== "object" && type !== "undefined") {
      failures.push(event + "/" + name + ": returned " + type);
    }
  } catch(e) {
    failures.push(event + "/" + name + ": " + e.message.split("\n")[0]);
  }
}

for (var ei = 0; ei < events.length; ei++) {
  var evDir = path.join(modsDir, events[ei]);
  var files = fs.readdirSync(evDir);
  for (var fi = 0; fi < files.length; fi++) {
    var fp = path.join(evDir, files[fi]);
    if (fs.statSync(fp).isDirectory()) {
      if (files[fi] === "archive") continue;
      var subfiles = fs.readdirSync(fp).filter(function(f) { return f.slice(-3) === ".js"; });
      for (var si = 0; si < subfiles.length; si++) {
        testModule(events[ei], files[fi] + "/" + subfiles[si], path.join(fp, subfiles[si]));
      }
    } else if (files[fi].slice(-3) === ".js") {
      if (files[fi].charAt(0) === "_") {
        testHelper(events[ei], files[fi], fp);
      } else {
        testModule(events[ei], files[fi], fp);
      }
    }
  }
}

console.log("Tested " + total + " modules");
if (failures.length) {
  console.log("FAILURES (" + failures.length + "):");
  for (var f = 0; f < failures.length; f++) console.log("  " + failures[f]);
  process.exit(1);
} else {
  console.log("ALL OK");
}
