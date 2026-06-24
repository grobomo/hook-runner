// hook-runner — Workflow Engine
// Enforceable step pipelines with YAML definitions, state management, and gate validation.
// Zero dependencies. Works on Windows (Git Bash), Linux, macOS, Docker.
//
// Workflow discovery (priority order):
//   1. Project: $CLAUDE_PROJECT_DIR/workflows/*.yml
//   2. Global:  ~/.claude/hooks/workflows/*.yml
//   3. Built-in: <hook-runner>/workflows/*.yml (shipped with hook-runner)

"use strict";
var fs = require("fs");
var path = require("path");

var STATE_FILE = ".workflow-state.json";

// --- YAML Parser (minimal, no deps) ---
// Handles the subset of YAML used in workflow definitions:
// top-level scalars, step arrays with nested objects, string arrays, inline arrays

function parseYaml(text) {
  var result = {};
  var lines = text.split("\n");
  var i = 0;
  var currentArray = null;
  var currentArrayKey = null;
  var currentObj = null;

  while (i < lines.length) {
    var line = lines[i];
    var trimmed = line.replace(/\s+$/, "");

    if (!trimmed || trimmed.charAt(0) === "#") { i++; continue; }

    var indent = line.length - line.replace(/^\s+/, "").length;

    // Top-level scalar: "key: value"
    if (indent === 0 && trimmed.charAt(0) !== "-") {
      var m = trimmed.match(/^(\w+):\s*(.*)/);
      if (m) {
        currentArray = null; currentArrayKey = null; currentObj = null;
        var val = m[2].trim();
        if (!val) {
          currentArrayKey = m[1];
          result[m[1]] = [];
          currentArray = result[m[1]];
        } else {
          result[m[1]] = parseScalar(val);
        }
      }
      i++; continue;
    }

    // Array item: "  - id: value" or "  - value"
    if (trimmed.indexOf("- ") === 0 || (indent > 0 && trimmed.replace(/^\s+/, "").indexOf("- ") === 0)) {
      var content = trimmed.replace(/^\s+/, "").slice(2).trim();
      var kvMatch = content.match(/^(\w+):\s*(.*)/);
      if (kvMatch) {
        currentObj = {};
        currentObj[kvMatch[1]] = parseScalar(kvMatch[2]);
        if (currentArray) currentArray.push(currentObj);
      } else {
        if (currentArray) currentArray.push(parseScalar(content));
      }
      i++; continue;
    }

    // Nested key under array item
    if (indent > 0 && currentObj && trimmed.replace(/^\s+/, "").charAt(0) !== "-") {
      var nested = trimmed.trim();
      var kvMatch2 = nested.match(/^(\w+):\s*(.*)/);
      if (kvMatch2) {
        var key = kvMatch2[1];
        var val2 = kvMatch2[2].trim();
        if (!val2) {
          // Sub-object (like gate: or completion:)
          var subObj = {};
          i++;
          var subBaseIndent = -1;
          while (i < lines.length) {
            var subLine = lines[i];
            var subTrimmed = subLine.replace(/\s+$/, "");
            if (!subTrimmed) { i++; continue; }
            var subIndent = subLine.length - subLine.replace(/^\s+/, "").length;
            if (subBaseIndent === -1) subBaseIndent = subIndent;
            if (subIndent < subBaseIndent) break;
            var subKv = subTrimmed.trim().match(/^(\w+):\s*(.*)/);
            if (subKv) {
              subObj[subKv[1]] = parseScalar(subKv[2]);
            }
            i++;
          }
          currentObj[key] = subObj;
          continue;
        } else {
          currentObj[key] = parseScalar(val2);
        }
      }
      i++; continue;
    }

    i++;
  }

  return result;
}

function parseScalar(val) {
  if (!val || val === "~" || val === "null") return null;
  if (val === "true") return true;
  if (val === "false") return false;
  if (/^\d+$/.test(val)) return parseInt(val, 10);
  if ((val.charAt(0) === '"' && val.slice(-1) === '"') || (val.charAt(0) === "'" && val.slice(-1) === "'")) {
    return val.slice(1, -1);
  }
  if (val.charAt(0) === "[" && val.slice(-1) === "]") {
    var inner = val.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map(function(s) { return parseScalar(s.trim()); });
  }
  return val;
}

// --- Workflow Loading ---

function loadWorkflow(yamlPath) {
  var text = fs.readFileSync(yamlPath, "utf-8");
  var parsed = parseYaml(text);
  // Parse modules list (array of module base names)
  var modules = [];
  if (Array.isArray(parsed.modules)) {
    modules = parsed.modules.filter(function(m) { return typeof m === "string"; });
  }

  return {
    name: parsed.name || path.basename(yamlPath, ".yml"),
    description: parsed.description || "",
    version: parsed.version || 1,
    steps: (parsed.steps || []).filter(function(s) { return s && s.id; }).map(function(s) {
      return {
        id: s.id,
        name: s.name || s.id,
        gate: s.gate || {},
        completion: s.completion || {},
      };
    }),
    modules: modules,
    extends: parsed.extends || null,
    _path: yamlPath,
  };
}

function findWorkflows(projectDir) {
  var home = process.env.HOME || process.env.USERPROFILE || "";
  var dirs = [
    path.join(projectDir, "workflows"),
    path.join(home, ".claude", "hooks", "workflows"),
    path.join(__dirname, "workflows"),
  ];
  var workflows = [];
  var seen = {};
  for (var i = 0; i < dirs.length; i++) {
    var dir = dirs[i];
    if (!fs.existsSync(dir)) continue;
    var files = fs.readdirSync(dir);
    for (var j = 0; j < files.length; j++) {
      var f = files[j];
      if (!(f.slice(-4) === ".yml" || f.slice(-5) === ".yaml")) continue;
      try {
        var wf = loadWorkflow(path.join(dir, f));
        if (!seen[wf.name]) {
          seen[wf.name] = true;
          workflows.push(wf);
        }
      } catch(e) {}
    }
  }
  return workflows;
}

// --- State Management ---

function statePath(projectDir) {
  return path.join(projectDir, STATE_FILE);
}

function readState(projectDir) {
  var p = statePath(projectDir);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch(e) { return null; }
}

function writeState(state, projectDir) {
  fs.writeFileSync(statePath(projectDir), JSON.stringify(state, null, 2) + "\n");
  return state;
}

function initState(workflowName, yamlPath, projectDir) {
  var def = loadWorkflow(yamlPath);
  var steps = {};
  for (var i = 0; i < def.steps.length; i++) {
    steps[def.steps[i].id] = { status: "pending" };
  }
  var state = {
    workflow: workflowName,
    workflow_path: yamlPath,
    started_at: new Date().toISOString(),
    steps: steps,
  };
  return writeState(state, projectDir);
}

function resetState(projectDir) {
  var p = statePath(projectDir);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function completeStep(stepId, projectDir) {
  var state = readState(projectDir);
  if (!state) throw new Error("No active workflow");
  if (!state.steps[stepId]) throw new Error("Unknown step: " + stepId);
  state.steps[stepId] = {
    status: "completed",
    completed_at: new Date().toISOString(),
  };
  // Advance next pending step to in_progress
  var def = loadWorkflow(state.workflow_path);
  for (var i = 0; i < def.steps.length; i++) {
    var s = state.steps[def.steps[i].id];
    if (s && s.status === "pending") {
      s.status = "in_progress";
      break;
    }
  }
  return writeState(state, projectDir);
}

function currentStep(projectDir) {
  var state = readState(projectDir);
  if (!state) return null;
  var def = loadWorkflow(state.workflow_path);
  for (var i = 0; i < def.steps.length; i++) {
    var s = state.steps[def.steps[i].id];
    if (s && s.status === "in_progress") return def.steps[i].id;
  }
  for (var j = 0; j < def.steps.length; j++) {
    var s2 = state.steps[def.steps[j].id];
    if (s2 && s2.status === "pending") return def.steps[j].id;
  }
  return null; // All done
}

// --- Gate Checking ---

function checkGate(stepId, projectDir) {
  var state = readState(projectDir);
  if (!state) return { allowed: true, reason: "no active workflow" };

  var def;
  try { def = loadWorkflow(state.workflow_path); } catch(e) {
    return { allowed: true, reason: "workflow YAML not found: " + state.workflow_path };
  }
  var stepDef = null;
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].id === stepId) { stepDef = def.steps[i]; break; }
  }
  if (!stepDef) return { allowed: true, reason: "unknown step" };

  var gate = stepDef.gate;
  var reasons = [];

  if (gate.require_step) {
    var reqStatus = state.steps[gate.require_step];
    if (!reqStatus || reqStatus.status !== "completed") {
      reasons.push('Step "' + gate.require_step + '" not completed');
    }
  }

  if (gate.require_files && Array.isArray(gate.require_files) && gate.require_files.length > 0) {
    for (var j = 0; j < gate.require_files.length; j++) {
      var f = gate.require_files[j];
      var fullPath = path.isAbsolute(f) ? f : path.join(projectDir, f);
      if (!fs.existsSync(fullPath)) {
        reasons.push("Required file missing: " + f);
      }
    }
  }

  if (reasons.length > 0) {
    return { allowed: false, step: stepId, reasons: reasons };
  }
  return { allowed: true, step: stepId };
}

function checkEditAllowed(filePath, projectDir) {
  var state = readState(projectDir);
  if (!state) return { allowed: true };

  var current = currentStep(projectDir);
  if (!current) return { allowed: true };

  return checkGate(current, projectDir);
}

// --- Workflow Config (enable/disable) ---
// Stored in <dir>/workflow-config.json (global: ~/.claude/hooks/, per-project: $CLAUDE_PROJECT_DIR)

var CONFIG_FILE = "workflow-config.json";

function configPath(dir) {
  return path.join(dir, CONFIG_FILE);
}

function readConfig(dir) {
  var p = configPath(dir);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch(e) { return {}; }
}

function writeConfig(config, dir) {
  fs.writeFileSync(configPath(dir), JSON.stringify(config, null, 2) + "\n");
}

function enableWorkflow(name, dir) {
  var config = readConfig(dir);
  config[name] = true;
  writeConfig(config, dir);
}

function disableWorkflow(name, dir) {
  var config = readConfig(dir);
  config[name] = false;
  writeConfig(config, dir);
}

function isWorkflowEnabled(name, dir) {
  var config = readConfig(dir);
  return config[name] === true;
}

function enabledWorkflows(dir) {
  var config = readConfig(dir);
  return Object.keys(config).filter(function(k) { return config[k] === true; });
}

module.exports = {
  parseYaml: parseYaml,
  loadWorkflow: loadWorkflow,
  findWorkflows: findWorkflows,
  readState: readState,
  writeState: writeState,
  initState: initState,
  resetState: resetState,
  completeStep: completeStep,
  currentStep: currentStep,
  checkGate: checkGate,
  checkEditAllowed: checkEditAllowed,
  readConfig: readConfig,
  writeConfig: writeConfig,
  enableWorkflow: enableWorkflow,
  disableWorkflow: disableWorkflow,
  isWorkflowEnabled: isWorkflowEnabled,
  enabledWorkflows: enabledWorkflows,
  STATE_FILE: STATE_FILE,
  CONFIG_FILE: CONFIG_FILE,
};
