#!/usr/bin/env node
"use strict";
// hook-runner — Workflow CLI commands
// Extracted from setup.js to reduce file size.
// All --workflow subcommands live here.

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "";

function cmdWorkflow(args) {
  var wf;
  try { wf = require(path.join(__dirname, "workflow.js")); } catch(e) {
    console.error("[workflow] workflow.js not found in hook-runner directory.");
    process.exit(1);
  }
  var sub = null;
  for (var i = 0; i < args.length; i++) {
    if (args[i] === "--workflow") { sub = args[i + 1] || null; break; }
  }
  var projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  var globalDir = path.join(HOME, ".claude", "hooks");

  if (!sub || sub === "list") {
    var workflows = wf.findWorkflows(projectDir);
    if (workflows.length === 0) { console.log("No workflows found."); return; }
    var globalConfig = wf.readConfig(globalDir);
    var projectConfig = wf.readConfig(projectDir);
    for (var wi = 0; wi < workflows.length; wi++) {
      var w = workflows[wi];
      var modCount = (w.modules || []).length;
      // Determine effective enabled state (project overrides global)
      var state = "off";
      if (globalConfig[w.name] === true) state = "global";
      if (projectConfig[w.name] === true) state = "project";
      if (projectConfig[w.name] === false) state = "off (project override)";
      if (globalConfig[w.name] === false && !projectConfig.hasOwnProperty(w.name)) state = "off";
      var stateLabel = state === "off" || state.startsWith("off") ? "  " : "ON";
      console.log("[" + stateLabel + "] " + w.name + " — " + modCount + " modules — " + (w.description || ""));
      if (modCount > 0) {
        console.log("     modules: " + (w.modules || []).join(", "));
      }
      if (w.steps.length > 1 || (w.steps.length === 1 && w.steps[0].id !== "active")) {
        console.log("     steps: " + w.steps.map(function(s) { return s.id; }).join(" → "));
      }
    }
    return;
  }

  if (sub === "enable") {
    var enName = args[args.indexOf("enable") + 1];
    if (!enName) { console.error("Usage: --workflow enable <name> [--global]"); process.exit(1); }
    var isGlobal = args.indexOf("--global") !== -1;
    var targetDir = isGlobal ? globalDir : projectDir;
    var workflows = wf.findWorkflows(projectDir);
    var found = false;
    for (var ei = 0; ei < workflows.length; ei++) {
      if (workflows[ei].name === enName) { found = true; break; }
    }
    if (!found) { console.error("Workflow not found: " + enName); process.exit(1); }
    wf.enableWorkflow(enName, targetDir);
    var scope = isGlobal ? "globally" : "for this project";
    console.log('Enabled workflow "' + enName + '" ' + scope + ".");
    var mods = workflows.filter(function(w) { return w.name === enName; })[0].modules || [];
    if (mods.length > 0) console.log("  " + mods.length + " module(s) now active: " + mods.join(", "));
    return;
  }

  if (sub === "disable") {
    var disName = args[args.indexOf("disable") + 1];
    if (!disName) { console.error("Usage: --workflow disable <name> [--global]"); process.exit(1); }
    var isGlobalDis = args.indexOf("--global") !== -1;
    var targetDirDis = isGlobalDis ? globalDir : projectDir;
    wf.disableWorkflow(disName, targetDirDis);
    var scopeDis = isGlobalDis ? "globally" : "for this project";
    console.log('Disabled workflow "' + disName + '" ' + scopeDis + ".");
    return;
  }

  if (sub === "start") {
    var wfName = args[args.indexOf("start") + 1];
    if (!wfName) { console.error("Usage: --workflow start <name>"); process.exit(1); }
    var existing = wf.readState(projectDir);
    if (existing) { console.error('Workflow "' + existing.workflow + '" already active. Reset first.'); process.exit(1); }
    var workflows = wf.findWorkflows(projectDir);
    var target = null;
    for (var fi = 0; fi < workflows.length; fi++) {
      if (workflows[fi].name === wfName) { target = workflows[fi]; break; }
    }
    if (!target) { console.error("Workflow not found: " + wfName); process.exit(1); }
    wf.initState(wfName, target._path, projectDir);
    var current = wf.currentStep(projectDir);
    console.log('Started workflow "' + wfName + '". Current step: ' + current);
    return;
  }

  if (sub === "status") {
    var state = wf.readState(projectDir);
    if (!state) { console.log("No active workflow."); return; }
    console.log("Workflow: " + state.workflow);
    console.log("Started:  " + state.started_at);
    console.log("");
    var def = wf.loadWorkflow(state.workflow_path);
    var current = wf.currentStep(projectDir);
    for (var di = 0; di < def.steps.length; di++) {
      var step = def.steps[di];
      var s = state.steps[step.id] || {};
      var marker = "  ";
      if (s.status === "completed") marker = "OK";
      else if (step.id === current) marker = ">>";
      var status = s.status || "pending";
      console.log(marker + " " + step.id.padEnd(20) + status.padEnd(14) + step.name);
    }
    return;
  }

  if (sub === "complete") {
    var stepId = args[args.indexOf("complete") + 1];
    if (!stepId) { console.error("Usage: --workflow complete <step-id>"); process.exit(1); }
    wf.completeStep(stepId, projectDir);
    var next = wf.currentStep(projectDir);
    console.log('Completed step "' + stepId + '".' + (next ? " Next: " + next : " Workflow complete!"));
    return;
  }

  if (sub === "reset") {
    var resetState = wf.readState(projectDir);
    if (!resetState) { console.log("No active workflow to reset."); return; }
    var name = resetState.workflow;
    wf.resetState(projectDir);
    console.log('Workflow "' + name + '" cleared.');
    return;
  }

  if (sub === "audit") {
    var lm;
    try { lm = require(path.join(__dirname, "load-modules.js")); } catch(e) {
      console.error("[audit] load-modules.js not found."); process.exit(1);
    }
    // Load workflows from the repo catalog (not projectDir which may have stale copies)
    var wfDir = path.join(__dirname, "workflows");
    var workflows = [];
    if (fs.existsSync(wfDir)) {
      var wfFiles = fs.readdirSync(wfDir).filter(function(f) { return f.endsWith(".yml") || f.endsWith(".yaml"); }).sort();
      for (var wfi = 0; wfi < wfFiles.length; wfi++) {
        try { workflows.push(wf.loadWorkflow(path.join(wfDir, wfFiles[wfi]))); } catch(e) {}
      }
    }

    // Build workflow name → modules from YAML definitions
    var yamlModules = {}; // workflow name → [module names]
    for (var ai = 0; ai < workflows.length; ai++) {
      yamlModules[workflows[ai].name] = workflows[ai].modules || [];
    }

    // Scan all modules across all events
    var modulesDir = path.join(__dirname, "modules");
    var events = ["PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"];
    var allModules = []; // {name, event, path, tag}
    for (var ei = 0; ei < events.length; ei++) {
      var evDir = path.join(modulesDir, events[ei]);
      if (!fs.existsSync(evDir)) continue;
      var files = fs.readdirSync(evDir).filter(function(f) { return f.endsWith(".js"); }).sort();
      for (var fi = 0; fi < files.length; fi++) {
        var modPath = path.join(evDir, files[fi]);
        var tag = lm.parseWorkflowTag(modPath);
        allModules.push({ name: files[fi].replace(/\.js$/, ""), event: events[ei], path: modPath, tag: tag });
      }
    }

    var tagged = allModules.filter(function(m) { return m.tag; });
    var untagged = allModules.filter(function(m) { return !m.tag; });

    // Per-workflow counts from actual tags
    var tagCounts = {};
    for (var ti = 0; ti < tagged.length; ti++) {
      tagCounts[tagged[ti].tag] = (tagCounts[tagged[ti].tag] || 0) + 1;
    }

    // Coverage summary
    console.log("=== Workflow Audit ===");
    console.log("");
    console.log("Coverage: " + allModules.length + " modules total, " + tagged.length + " tagged, " + untagged.length + " untagged");
    console.log("");

    // Per-workflow breakdown
    console.log("Per-workflow module counts:");
    var wfNames = Object.keys(yamlModules).sort();
    for (var wi = 0; wi < wfNames.length; wi++) {
      var wn = wfNames[wi];
      var yamlCount = yamlModules[wn].length;
      var actualCount = tagCounts[wn] || 0;
      console.log("  " + wn + ": " + actualCount + " modules — " + (yamlCount === actualCount ? "OK (matches YAML)" : actualCount + " actual vs " + yamlCount + " in YAML"));
    }

    // Orphan tags: modules tagged with a workflow that has no YAML
    var orphanTags = {};
    for (var oi = 0; oi < tagged.length; oi++) {
      if (!yamlModules[tagged[oi].tag]) {
        if (!orphanTags[tagged[oi].tag]) orphanTags[tagged[oi].tag] = [];
        orphanTags[tagged[oi].tag].push(tagged[oi].event + "/" + tagged[oi].name);
      }
    }
    var orphanKeys = Object.keys(orphanTags);
    if (orphanKeys.length > 0) {
      console.log("");
      console.log("Orphan tags (no matching workflow YAML):");
      for (var ok = 0; ok < orphanKeys.length; ok++) {
        console.log("  " + orphanKeys[ok] + ": " + orphanTags[orphanKeys[ok]].join(", "));
      }
    }

    // Missing modules: listed in YAML but no matching tagged module file
    var missing = [];
    for (var mi2 = 0; mi2 < wfNames.length; mi2++) {
      var wn2 = wfNames[mi2];
      var yamlMods = yamlModules[wn2];
      for (var ym = 0; ym < yamlMods.length; ym++) {
        var found = false;
        for (var am = 0; am < allModules.length; am++) {
          if (allModules[am].name === yamlMods[ym]) { found = true; break; }
        }
        if (!found) missing.push(wn2 + "/" + yamlMods[ym]);
      }
    }
    if (missing.length > 0) {
      console.log("");
      console.log("Missing modules (in YAML but no file):");
      for (var mm = 0; mm < missing.length; mm++) {
        console.log("  " + missing[mm]);
      }
    }

    // Untagged modules
    if (untagged.length > 0) {
      console.log("");
      console.log("Untagged modules (no workflow tag):");
      for (var ui = 0; ui < untagged.length; ui++) {
        console.log("  " + untagged[ui].event + "/" + untagged[ui].name);
      }
    }

    // Tag-YAML mismatches: module tagged X but listed in workflow Y's YAML
    var mismatches = [];
    for (var tmi = 0; tmi < tagged.length; tmi++) {
      var mod = tagged[tmi];
      // Check if this module is listed in a different workflow's YAML
      // Skip if the module is also listed in its tagged workflow (shared module)
      var inTaggedWorkflow = yamlModules[mod.tag] && yamlModules[mod.tag].indexOf(mod.name) !== -1;
      for (var twi = 0; twi < wfNames.length; twi++) {
        if (wfNames[twi] === mod.tag) continue;
        if (yamlModules[wfNames[twi]].indexOf(mod.name) !== -1) {
          if (inTaggedWorkflow) continue; // shared between workflows, tag matches primary
          mismatches.push(mod.event + "/" + mod.name + " tagged=" + mod.tag + " but listed in " + wfNames[twi] + " YAML");
        }
      }
    }
    if (mismatches.length > 0) {
      console.log("");
      console.log("Tag/YAML mismatches:");
      for (var mmi = 0; mmi < mismatches.length; mmi++) {
        console.log("  " + mismatches[mmi]);
      }
    }

    if (orphanKeys.length === 0 && missing.length === 0 && mismatches.length === 0) {
      console.log("");
      console.log("No issues found.");
    }
    return;
  }

  if (sub === "query") {
    var queryTool = args[args.indexOf("query") + 1];
    if (!queryTool) { console.error("Usage: --workflow query <tool-name> (e.g. Edit, Write, Bash)"); process.exit(1); }
    var lmq;
    try { lmq = require(path.join(__dirname, "load-modules.js")); } catch(e) {
      console.error("[query] load-modules.js not found."); process.exit(1);
    }
    // Scan all PreToolUse modules for references to the queried tool
    var modulesDir = path.join(__dirname, "modules", "PreToolUse");
    var matches = [];
    if (fs.existsSync(modulesDir)) {
      var files = fs.readdirSync(modulesDir).filter(function(f) { return f.endsWith(".js"); }).sort();
      for (var qi = 0; qi < files.length; qi++) {
        try {
          var src = fs.readFileSync(path.join(modulesDir, files[qi]), "utf-8");
          // Check if module source references the tool name (case-sensitive match for tool names)
          var toolPattern = new RegExp('["\'\\s]' + queryTool + '["\'\\s,;)\\]]', 'g');
          if (toolPattern.test(src)) {
            var tag = lmq.parseWorkflowTag(path.join(modulesDir, files[qi]));
            matches.push({ name: files[qi].replace(/\.js$/, ""), workflow: tag || "(untagged)" });
          }
        } catch(e) {}
      }
    }
    console.log("Modules affecting " + queryTool + ":");
    if (matches.length === 0) {
      console.log("  No modules found matching tool: " + queryTool);
    } else {
      for (var mi3 = 0; mi3 < matches.length; mi3++) {
        console.log("  " + matches[mi3].name + " — workflow: " + matches[mi3].workflow);
      }
    }
    return;
  }

  if (sub === "create") {
    var createName = args[args.indexOf("create") + 1];
    if (!createName) { console.error("Usage: --workflow create <name> [--dir <path>]"); process.exit(1); }
    // WHY: Manual workflow creation requires editing YAML, module files, and live copies.
    // This command generates a complete scaffold so workflows are a first-class CLI citizen.
    var dirIdx = args.indexOf("--dir");
    var targetBase = dirIdx !== -1 && args[dirIdx + 1] ? args[dirIdx + 1] : __dirname;
    var wfDir = path.join(targetBase, "workflows");
    if (!fs.existsSync(wfDir)) fs.mkdirSync(wfDir, { recursive: true });
    var wfPath = path.join(wfDir, createName + ".yml");
    if (fs.existsSync(wfPath)) {
      console.error('Workflow "' + createName + '" already exists at ' + wfPath);
      process.exit(1);
    }
    var yaml = [
      "name: " + createName,
      "description: TODO — explain WHY this workflow exists and what problem it solves",
      "version: 1",
      "steps:",
      "  - id: active",
      "    name: Workflow is active",
      "    gate:",
      "      require_files: []",
      "    completion:",
      "      require_files: []",
      "",
      "modules: []",
      "",
    ].join("\n");
    fs.writeFileSync(wfPath, yaml);
    console.log('Created workflow "' + createName + '" at ' + wfPath);
    console.log("Next steps:");
    console.log("  1. Edit description to explain WHY this workflow exists");
    console.log("  2. Add modules: --workflow add-module " + createName + " <module-name>");
    console.log("  3. Enable: --workflow enable " + createName);
    return;
  }

  if (sub === "add-module") {
    var addWfName = args[args.indexOf("add-module") + 1];
    var addModName = args[args.indexOf("add-module") + 2];
    if (!addWfName || !addModName) {
      console.error("Usage: --workflow add-module <workflow> <module-name> [--event <Event>]");
      process.exit(1);
    }
    // WHY: Adding a module to a workflow requires creating a JS file with the right tag,
    // updating the YAML modules list, and copying to live hooks. Automate all three.
    var evIdx = args.indexOf("--event");
    var event = evIdx !== -1 && args[evIdx + 1] ? args[evIdx + 1] : "PreToolUse";
    var modDir = path.join(__dirname, "modules", event);
    if (!fs.existsSync(modDir)) fs.mkdirSync(modDir, { recursive: true });
    var modPath = path.join(modDir, addModName + ".js");
    if (fs.existsSync(modPath)) {
      console.log('Module "' + addModName + '" already exists. Updating WORKFLOW tag and YAML.');
    } else {
      // WHY: Every module must trace back to a real incident or design decision.
      // The stub forces the author to fill in WHY before the module does anything.
      var stub = [
        "// WORKFLOW: " + addWfName,
        '// WHY: TODO — describe the real incident or problem that caused this module.',
        '"use strict";',
        "",
        "module.exports = function(input) {",
        "  // TODO: implement gate logic",
        "  return null;",
        "};",
        "",
      ].join("\n");
      fs.writeFileSync(modPath, stub);
      console.log("Created module: " + modPath);
    }
    // Update YAML modules list
    var wfDir2 = path.join(__dirname, "workflows");
    var wfPath2 = path.join(wfDir2, addWfName + ".yml");
    if (fs.existsSync(wfPath2)) {
      var content = fs.readFileSync(wfPath2, "utf-8");
      if (content.indexOf("  - " + addModName) === -1) {
        // Add module to modules list
        content = content.replace(/^modules:\s*\[?\]?/m, "modules:\n  - " + addModName);
        if (content.indexOf("modules:") === -1) {
          content += "\nmodules:\n  - " + addModName + "\n";
        } else if (content.indexOf("  - " + addModName) === -1) {
          content = content.replace(/(modules:.*\n(?:\s+-\s+\S+\n)*)/m, "$1  - " + addModName + "\n");
        }
        fs.writeFileSync(wfPath2, content);
        console.log("Added to " + wfPath2);
      } else {
        console.log("Module already listed in " + wfPath2);
      }
    } else {
      console.log("Warning: workflow YAML not found at " + wfPath2);
    }
    // Copy to live hooks
    var liveDir = path.join(HOME, ".claude", "hooks", "run-modules", event);
    if (fs.existsSync(liveDir)) {
      try {
        fs.copyFileSync(modPath, path.join(liveDir, addModName + ".js"));
        console.log("Copied to live: " + path.join(liveDir, addModName + ".js"));
      } catch(e) {
        console.log("Warning: could not copy to live hooks: " + e.message);
      }
    }
    return;
  }

  if (sub === "sync-live") {
    // WHY: After editing modules/workflows in the repo, the live hooks dir
    // needs to be updated. This copies all workflow YAMLs and tagged modules.
    var home = process.env.HOME || process.env.USERPROFILE || "";
    var liveHooksDir = path.join(home, ".claude", "hooks");
    var liveWfDir = path.join(liveHooksDir, "workflows");
    if (!fs.existsSync(liveWfDir)) fs.mkdirSync(liveWfDir, { recursive: true });
    // Sync workflow YAMLs
    var srcWfDir = path.join(__dirname, "workflows");
    var copied = 0;
    if (fs.existsSync(srcWfDir)) {
      var wfFiles = fs.readdirSync(srcWfDir).filter(function(f) { return f.endsWith(".yml") || f.endsWith(".yaml"); });
      for (var wi2 = 0; wi2 < wfFiles.length; wi2++) {
        fs.copyFileSync(path.join(srcWfDir, wfFiles[wi2]), path.join(liveWfDir, wfFiles[wi2]));
        copied++;
      }
    }
    // Sync core files (runners, loader, logger, async helper)
    var coreFiles = [
      "run-pretooluse.js", "run-posttooluse.js", "run-stop.js",
      "run-sessionstart.js", "run-userpromptsubmit.js",
      "load-modules.js", "hook-log.js", "run-async.js"
    ];
    for (var ci2 = 0; ci2 < coreFiles.length; ci2++) {
      var srcCore = path.join(__dirname, coreFiles[ci2]);
      if (fs.existsSync(srcCore)) {
        fs.copyFileSync(srcCore, path.join(liveHooksDir, coreFiles[ci2]));
        copied++;
      }
    }
    // Sync modules
    var events = ["PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"];
    for (var ei2 = 0; ei2 < events.length; ei2++) {
      var srcModDir = path.join(__dirname, "modules", events[ei2]);
      var dstModDir = path.join(liveHooksDir, "run-modules", events[ei2]);
      if (!fs.existsSync(srcModDir)) continue;
      if (!fs.existsSync(dstModDir)) fs.mkdirSync(dstModDir, { recursive: true });
      var entries = fs.readdirSync(srcModDir, { withFileTypes: true });
      for (var mi4 = 0; mi4 < entries.length; mi4++) {
        var ent = entries[mi4];
        if (ent.isFile() && ent.name.endsWith(".js")) {
          fs.copyFileSync(path.join(srcModDir, ent.name), path.join(dstModDir, ent.name));
          copied++;
        } else if (ent.isDirectory() && ent.name !== "archive") {
          // Project-scoped subdirectories (e.g. hackathon26/, ddei-email-security/)
          var subSrc = path.join(srcModDir, ent.name);
          var subDst = path.join(dstModDir, ent.name);
          if (!fs.existsSync(subDst)) fs.mkdirSync(subDst, { recursive: true });
          var subFiles = fs.readdirSync(subSrc).filter(function(f) { return f.endsWith(".js"); });
          for (var si = 0; si < subFiles.length; si++) {
            fs.copyFileSync(path.join(subSrc, subFiles[si]), path.join(subDst, subFiles[si]));
            copied++;
          }
        }
      }
    }
    console.log("Synced " + copied + " files to " + liveHooksDir);
    return;
  }

  console.error("Unknown workflow subcommand: " + sub);
  console.error("Usage: --workflow [list|audit|query|create|add-module|sync-live|enable|disable|start|status|complete|reset]");
  process.exit(1);
}

module.exports = cmdWorkflow;
