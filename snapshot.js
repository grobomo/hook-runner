#!/usr/bin/env node
"use strict";
// snapshot.js — Snapshot, drift detection, and git-backed backup/restore.
//
// Usage:
//   node snapshot.js create                # SHA256 manifest of current state
//   node snapshot.js drift [--json]        # detect changes since last snapshot
//   node snapshot.js backup [--repo URL]   # copy files to git repo, commit, push
//   node snapshot.js restore <repo|dir>    # clone repo, copy files into place

var fs = require("fs");
var path = require("path");
var os = require("os");
var crypto = require("crypto");
var cp = require("child_process");

var HOME = os.homedir();
var CLAUDE_DIR = path.join(HOME, ".claude");
var HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
var MODULES_DIR = path.join(HOOKS_DIR, "run-modules");
var WORKFLOWS_DIR = path.join(HOOKS_DIR, "workflows");
var SKILLS_DIR = path.join(CLAUDE_DIR, "skills");
var SNAPSHOTS_DIR = path.join(CLAUDE_DIR, "snapshots");
var VERSION = require(path.join(__dirname, "package.json")).version;
var EVENTS = ["PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"];

// ── Helpers ──

function sha256(p) {
  try { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }
  catch (e) { return null; }
}

function fsize(p) { try { return fs.statSync(p).size; } catch (e) { return 0; } }

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function walkDir(dir, prefix) {
  prefix = prefix || "";
  var out = [];
  var ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (var i = 0; i < ents.length; i++) {
    var n = ents[i].name;
    if (n === ".git" || n === "archive" || n === "node_modules") continue;
    if (n.endsWith(".jsonl") || n.endsWith(".log")) continue;
    var rel = prefix ? prefix + "/" + n : n;
    if (ents[i].isDirectory()) out = out.concat(walkDir(path.join(dir, n), rel));
    else if (ents[i].isFile()) out.push(rel);
  }
  return out;
}

function findMcpDir() {
  var mcpJson = path.join(CLAUDE_DIR, ".mcp.json");
  if (fs.existsSync(mcpJson)) {
    try {
      var cfg = JSON.parse(fs.readFileSync(mcpJson, "utf-8"));
      var mgr = cfg.mcpServers && cfg.mcpServers["mcp-manager"];
      if (mgr && mgr.args && mgr.args[0]) {
        var d = path.dirname(path.dirname(mgr.args[0]));
        if (fs.existsSync(d)) return d;
      }
    } catch (e) {}
  }
  var od = path.join(HOME, "OneDrive - TrendMicro", "Documents", "ProjectsCL", "MCP", "mcp-manager");
  return fs.existsSync(od) ? od : null;
}

// ── Collect all files to snapshot ──

function collectFiles() {
  var files = {};
  function add(cat, absPath, label) {
    var h = sha256(absPath);
    if (h) files[label] = { category: cat, sha256: h, size: fsize(absPath), absPath: absPath.replace(/\\/g, "/") };
  }

  // Config
  ["settings.json", "CLAUDE.md", ".mcp.json"].forEach(function(f) {
    var p = path.join(CLAUDE_DIR, f);
    if (fs.existsSync(p)) add("config", p, "config/" + f);
  });

  // Runners
  var RUNNERS = require(path.join(__dirname, "constants.js")).RUNNER_FILES;
  RUNNERS.forEach(function(f) {
    var p = path.join(HOOKS_DIR, f);
    if (fs.existsSync(p)) add("runner", p, "runners/" + f);
  });

  // GSD + standalone hooks
  try {
    fs.readdirSync(HOOKS_DIR).forEach(function(f) {
      if (f.startsWith("gsd-") && (f.endsWith(".js") || f.endsWith(".sh")))
        add("gsd-hook", path.join(HOOKS_DIR, f), "gsd-hooks/" + f);
    });
  } catch (e) {}
  ["report.js", "setup.js", "run-hidden.js", "run-stop-bg.js", "watchdog.js",
   "reflection-score.js", "generate-manifest.js"].forEach(function(f) {
    var p = path.join(HOOKS_DIR, f);
    if (fs.existsSync(p)) add("standalone", p, "standalone/" + f);
  });

  // Modules
  EVENTS.forEach(function(evt) {
    walkDir(path.join(MODULES_DIR, evt)).forEach(function(f) {
      add("module", path.join(MODULES_DIR, evt, f), "modules/" + evt + "/" + f);
    });
  });

  // Workflows
  if (fs.existsSync(WORKFLOWS_DIR)) {
    fs.readdirSync(WORKFLOWS_DIR).filter(function(f) { return f.endsWith(".yml"); }).forEach(function(f) {
      add("workflow", path.join(WORKFLOWS_DIR, f), "workflows/" + f);
    });
  }

  // State files
  ["workflow-config.json", "reflection-score.json"].forEach(function(f) {
    var p = path.join(HOOKS_DIR, f);
    if (fs.existsSync(p)) add("state", p, "state/" + f);
  });

  // Skills (SKILL.md + entry scripts only)
  if (fs.existsSync(SKILLS_DIR)) {
    try {
      fs.readdirSync(SKILLS_DIR).forEach(function(sk) {
        var skDir = path.join(SKILLS_DIR, sk);
        try { if (!fs.statSync(skDir).isDirectory()) return; } catch (e) { return; }
        try {
          fs.readdirSync(skDir).forEach(function(f) {
            if (f === "SKILL.md" || f.endsWith(".js") || f.endsWith(".sh") || f.endsWith(".ps1") || f.endsWith(".py"))
              add("skill", path.join(skDir, f), "skills/" + sk + "/" + f);
          });
        } catch (e) {}
      });
    } catch (e) {}
  }

  // MCP config
  var mcpDir = findMcpDir();
  if (mcpDir) {
    ["servers.yaml", "capabilities-cache.yaml", "default-servers.json", "metadata.yaml"].forEach(function(f) {
      var p = path.join(mcpDir, f);
      if (fs.existsSync(p)) add("mcp", p, "mcp/" + f);
    });
  }

  return files;
}

// ── Create snapshot ──

function createSnapshot() {
  var files = collectFiles();
  var manifest = {
    version: "1.0.0",
    hookRunnerVersion: VERSION,
    timestamp: new Date().toISOString(),
    platform: process.platform,
    files: files
  };

  ensureDir(SNAPSHOTS_DIR);
  var name = manifest.timestamp.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  var snapPath = path.join(SNAPSHOTS_DIR, name + ".json");
  fs.writeFileSync(snapPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(SNAPSHOTS_DIR, "latest.json"), JSON.stringify(manifest, null, 2));

  var n = Object.keys(files).length;
  console.log("[snapshot] " + n + " files captured -> " + name);
  return { path: snapPath, manifest: manifest };
}

// ── Drift detection ──

function detectDrift(jsonMode) {
  var latestPath = path.join(SNAPSHOTS_DIR, "latest.json");
  if (!fs.existsSync(latestPath)) {
    console.error("[drift] No snapshot. Run: node snapshot.js create");
    process.exit(1);
  }

  var snap = JSON.parse(fs.readFileSync(latestPath, "utf-8"));
  var results = { timestamp: snap.timestamp, modified: [], removed: [], added: [], unchanged: 0 };
  var ageH = Math.round((Date.now() - new Date(snap.timestamp).getTime()) / 3600000);

  // Check tracked files
  var labels = Object.keys(snap.files);
  for (var i = 0; i < labels.length; i++) {
    var e = snap.files[labels[i]];
    var h = sha256(e.absPath.replace(/\//g, path.sep));
    if (!h) results.removed.push(labels[i]);
    else if (h !== e.sha256) results.modified.push(labels[i]);
    else results.unchanged++;
  }

  // Check for new files
  var live = collectFiles();
  Object.keys(live).forEach(function(l) { if (!snap.files[l]) results.added.push(l); });

  if (jsonMode) { console.log(JSON.stringify(results, null, 2)); return results; }

  var total = results.modified.length + results.removed.length + results.added.length;
  if (total === 0) {
    console.log("[drift] OK — " + results.unchanged + " files unchanged (snapshot " + ageH + "h old)");
    return results;
  }

  console.log("[drift] " + total + " change(s) detected (snapshot " + ageH + "h old):");
  results.modified.forEach(function(f) { console.log("  [MOD] " + f); });
  results.removed.forEach(function(f) { console.log("  [DEL] " + f); });
  results.added.forEach(function(f) { console.log("  [NEW] " + f); });
  return results;
}

// ── Backup to git repo ──

function backup(repoUrl) {
  // Find or create backup dir
  var backupDir = path.join(CLAUDE_DIR, "backup-repo");
  var isNew = false;

  if (!fs.existsSync(backupDir)) {
    if (repoUrl) {
      console.log("[backup] Cloning " + repoUrl + "...");
      cp.execSync('git clone "' + repoUrl + '" "' + backupDir.replace(/\\/g, "/") + '"', { stdio: "pipe", windowsHide: true });
    } else {
      ensureDir(backupDir);
      cp.execSync("git init", { cwd: backupDir, stdio: "pipe", windowsHide: true });
      isNew = true;
    }
  }

  // Create snapshot first
  var snap = createSnapshot();
  var files = snap.manifest.files;

  // Copy all files into backup repo
  var labels = Object.keys(files);
  var copied = 0;
  for (var i = 0; i < labels.length; i++) {
    var src = files[labels[i]].absPath.replace(/\//g, path.sep);
    var dest = path.join(backupDir, labels[i].replace(/\//g, path.sep));
    ensureDir(path.dirname(dest));
    try { fs.copyFileSync(src, dest); copied++; } catch (e) {}
  }

  // Copy manifest
  fs.copyFileSync(snap.path, path.join(backupDir, "snapshot.json"));

  // Commit
  cp.execSync("git add -A", { cwd: backupDir, stdio: "pipe", windowsHide: true });
  var status = cp.execSync("git status --porcelain", { cwd: backupDir, encoding: "utf-8", windowsHide: true }).trim();
  if (!status) {
    console.log("[backup] No changes since last backup.");
    return;
  }

  var msg = "backup " + new Date().toISOString().slice(0, 19).replace("T", " ") + " (" + copied + " files)";
  cp.execSync('git commit -m "' + msg + '"', { cwd: backupDir, stdio: "pipe", windowsHide: true });

  // Push if remote exists — use gh auth token for correct account
  try {
    var remote = cp.execSync("git remote get-url origin", { cwd: backupDir, encoding: "utf-8", windowsHide: true }).trim();
    if (remote) {
      console.log("[backup] Pushing to " + remote + "...");
      var account = remote.indexOf("grobomo") !== -1 ? "grobomo" : null;
      var pushEnv = Object.assign({}, process.env);
      if (account) {
        try {
          var token = cp.execSync("gh auth token --user " + account, { encoding: "utf-8", windowsHide: true }).trim();
          if (token) pushEnv.GH_TOKEN = token;
        } catch (e2) {}
      }
      cp.execSync("git push -u origin main 2>/dev/null || git push -u origin master", {
        cwd: backupDir, stdio: "pipe", windowsHide: true, env: pushEnv
      });
    }
  } catch (e) {
    // No remote — local-only backup is fine
  }

  console.log("[backup] " + copied + " files committed to " + backupDir);
  if (isNew) console.log("  Add remote: cd " + backupDir + " && git remote add origin <url> && git push -u origin main");
}

// ── Restore from git repo or directory ──

function restore(source, dryRun) {
  if (!source) {
    // Default: use existing backup-repo
    source = path.join(CLAUDE_DIR, "backup-repo");
    if (!fs.existsSync(source)) {
      console.error("[restore] Usage: node snapshot.js restore <repo-url|directory>");
      process.exit(1);
    }
  }

  var restoreDir = source;

  // If it looks like a URL, clone it
  if (source.includes("github.com") || source.startsWith("git@")) {
    restoreDir = path.join(os.tmpdir(), "hook-runner-restore-" + Date.now());
    console.log("[restore] Cloning " + source + "...");
    cp.execSync('git clone "' + source + '" "' + restoreDir.replace(/\\/g, "/") + '"', { stdio: "pipe", windowsHide: true });
  }

  var snapFile = path.join(restoreDir, "snapshot.json");
  if (!fs.existsSync(snapFile)) {
    console.error("[restore] No snapshot.json found in " + restoreDir);
    process.exit(1);
  }

  var manifest = JSON.parse(fs.readFileSync(snapFile, "utf-8"));
  var labels = Object.keys(manifest.files);
  var restored = 0;

  for (var i = 0; i < labels.length; i++) {
    var label = labels[i];
    var src = path.join(restoreDir, label.replace(/\//g, path.sep));
    if (!fs.existsSync(src)) continue;

    // Map label to target path
    var target;
    if (label.startsWith("config/")) target = path.join(CLAUDE_DIR, label.slice(7));
    else if (label.startsWith("runners/")) target = path.join(HOOKS_DIR, label.slice(8));
    else if (label.startsWith("modules/")) target = path.join(HOOKS_DIR, "run-modules", label.slice(8));
    else if (label.startsWith("workflows/")) target = path.join(HOOKS_DIR, label);
    else if (label.startsWith("gsd-hooks/")) target = path.join(HOOKS_DIR, label.slice(10));
    else if (label.startsWith("standalone/")) target = path.join(HOOKS_DIR, label.slice(11));
    else if (label.startsWith("state/")) target = path.join(HOOKS_DIR, label.slice(6));
    else if (label.startsWith("skills/")) target = path.join(CLAUDE_DIR, label);
    else if (label.startsWith("mcp/")) { continue; } // MCP paths are device-specific
    else target = path.join(HOOKS_DIR, label);

    if (dryRun) { console.log("  [WOULD] " + label + " -> " + target); }
    else { ensureDir(path.dirname(target)); fs.copyFileSync(src, target); }
    restored++;
  }

  console.log("[restore] " + restored + " files " + (dryRun ? "would be " : "") + "restored.");
  if (!dryRun) console.log("  Restart Claude Code to pick up changes.");
}

// ── Main ──

function main() {
  var args = process.argv.slice(2);
  var cmd = args[0] || "help";

  switch (cmd) {
    case "create":
      createSnapshot();
      break;
    case "drift":
    case "check":
      detectDrift(args.indexOf("--json") !== -1);
      break;
    case "backup":
      var repoIdx = args.indexOf("--repo");
      backup(repoIdx !== -1 ? args[repoIdx + 1] : null);
      break;
    case "restore":
      var restoreSrc = args[1] && !args[1].startsWith("--") ? args[1] : null;
      restore(restoreSrc, args.indexOf("--dry-run") !== -1);
      break;
    default:
      console.log("Usage: node snapshot.js <create|drift|backup|restore>");
      console.log("");
      console.log("  create              SHA256 snapshot of current state");
      console.log("  drift [--json]      Detect changes since last snapshot");
      console.log("  backup [--repo URL] Copy files to git repo, commit, push");
      console.log("  restore [repo|dir]  Clone/copy files back into place");
      break;
  }
}

module.exports = { createSnapshot: createSnapshot, detectDrift: detectDrift };

if (require.main === module) main();
