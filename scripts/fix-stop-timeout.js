#!/usr/bin/env node
"use strict";
// Fix Stop hook timeout: 5s -> 20s
// WHY: Stop hook takes 10-14s (Haiku call + modules) but settings.json
// has 5s timeout. Claude Code kills the process before output appears.
var fs = require("fs");
var path = require("path");

var settingsPath = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".claude", "settings.json"
);

// Backup first
var backup = settingsPath + ".bak-timeout-fix";
fs.copyFileSync(settingsPath, backup);
console.log("Backup: " + backup);

var settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

var stopHooks = settings.hooks && settings.hooks.Stop;
if (!stopHooks || !stopHooks[0] || !stopHooks[0].hooks || !stopHooks[0].hooks[0]) {
  console.log("ERROR: Stop hook not found in settings");
  process.exit(1);
}

var oldTimeout = stopHooks[0].hooks[0].timeout;
stopHooks[0].hooks[0].timeout = 20;

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
console.log("Stop timeout: " + oldTimeout + "s -> 20s");
console.log("Done. Restart Claude Code for the change to take effect.");
