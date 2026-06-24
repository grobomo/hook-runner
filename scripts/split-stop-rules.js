#!/usr/bin/env node
"use strict";
// T758: Split stop-haiku-rules.yaml into individual files
var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE;
var YAML_PATH = path.join(HOME, ".claude", "proxy", "stop-haiku-rules.yaml");
var OUT_DIR = path.join(__dirname, "..", "rules", "stop");

var yaml = fs.readFileSync(YAML_PATH, "utf-8");
var lines = yaml.split("\n");
var rules = [];
var current = null;

for (var i = 0; i < lines.length; i++) {
  var line = lines[i];
  var nameMatch = line.match(/^\s+-\s+name:\s*(.+)/);
  if (nameMatch) {
    if (current) rules.push(current);
    current = { name: nameMatch[1].trim(), check: "", action: "" };
    continue;
  }
  if (!current) continue;

  // Match check: "..."
  var checkMatch = line.match(/^\s+check:\s*"(.+)"\s*$/);
  if (checkMatch) { current.check = checkMatch[1]; continue; }

  // Match action: "..."
  var actionMatch = line.match(/^\s+action:\s*"(.+)"\s*$/);
  if (actionMatch) { current.action = actionMatch[1]; continue; }
}
if (current) rules.push(current);

console.log("Parsed " + rules.length + " rules from " + YAML_PATH);

// Ensure output dir exists
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

var count = 0;
for (var r = 0; r < rules.length; r++) {
  var rule = rules[r];
  if (!rule.check || !rule.action) {
    console.log("SKIP (incomplete): " + rule.name + " check=" + !!rule.check + " action=" + !!rule.action);
    continue;
  }

  var num = String(r + 1).padStart(2, "0");
  var filename = num + "-" + rule.name + ".yaml";

  var content = "# Stop Rule: " + rule.name + "\n";
  content += "# Loaded by auto-continue-gate.js at every Stop event\n";
  content += "#\n";
  content += "# Format: name, check (question for Haiku), action (instruction if triggered)\n";
  content += "# To disable: rename file with _ prefix (e.g., _" + filename + ")\n";
  content += "\n";
  content += "name: " + rule.name + "\n";
  content += 'check: "' + rule.check + '"\n';
  content += 'action: "' + rule.action + '"\n';

  fs.writeFileSync(path.join(OUT_DIR, filename), content);
  count++;
  console.log("  " + filename);
}

console.log("\nWrote " + count + " files to " + OUT_DIR);
