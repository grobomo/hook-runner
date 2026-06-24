#!/usr/bin/env node
// Helper: deploy a module from repo to live hooks
// Usage: node scripts/deploy-module.js PreToolUse/gate-quality-gate.js
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");
var mod = process.argv[2];
if (!mod) { console.error("Usage: node deploy-module.js Event/module-name.js"); process.exit(1); }
var src = path.join(__dirname, "..", "modules", mod);
var dst = path.join(os.homedir(), ".claude", "hooks", "run-modules", mod);
fs.copyFileSync(src, dst);
require(dst); // verify it loads
console.log("Deployed: " + mod);
