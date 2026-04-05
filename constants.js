#!/usr/bin/env node
"use strict";
// Shared constants for hook-runner.
// Single source of truth for file lists used by install, upgrade, uninstall, and sync-live.

var RUNNER_FILES = [
  "run-pretooluse.js", "run-posttooluse.js", "run-stop.js",
  "run-sessionstart.js", "run-userpromptsubmit.js",
  "load-modules.js", "hook-log.js", "run-async.js",
  "workflow.js", "workflow-cli.js", "constants.js"
];

module.exports = { RUNNER_FILES: RUNNER_FILES };
