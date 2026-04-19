// TOOLS: Edit, Write
// WORKFLOW: shtd, gsd
// WHY: Renamed to test-checkpoint-gate (T504). Alias kept for modules.yaml backwards compat.
"use strict";
// Alias: delegates to test-checkpoint-gate.js
var path = require("path");
var real = require(path.join(__dirname, "test-checkpoint-gate.js"));
module.exports = function(input) { return real(input); };
