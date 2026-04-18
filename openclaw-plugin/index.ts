/**
 * hook-runner-gates — Ported hook-runner gate modules for OpenClaw
 *
 * Three pilot modules:
 * - force-push-gate: Blocks git push --force to main/master
 * - secret-scan-gate: Blocks commits with API keys/tokens
 * - commit-quality-gate: Blocks generic/short commit messages
 *
 * Ported from: https://github.com/grobomo/hook-runner
 * Original format: CommonJS (PreToolUse gates)
 * OpenClaw format: Plugin SDK (definePluginEntry + api.on("before_tool_call"))
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { execFileSync } from "node:child_process";

// ── Types ──────────────────────────────────────────────────────────────────

interface GateConfig {
  modules?: Record<string, boolean>;
}

interface SecretPattern {
  name: string;
  re: RegExp;
  context?: RegExp;
}

// ── Module: force-push-gate ────────────────────────────────────────────────
// WHY: Force-pushing to main/master can destroy shared history and others' work.

function forcePushGate(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const cmd = (String(params.command || "")).replace(/\s+/g, " ").trim();
  if (!/\bgit\s+push\b/.test(cmd)) return null;

  const hasForce = /\s--force\b/.test(cmd) || /\s-f\b/.test(cmd) || /\s--force-with-lease\b/.test(cmd);
  if (!hasForce) return null;

  const protectedBranches = ["main", "master"];
  for (const branch of protectedBranches) {
    if (new RegExp("\\b" + branch + "\\b").test(cmd)) {
      return `BLOCKED: Force-push to ${branch} is destructive and irreversible. Use a regular push or create a revert commit instead.`;
    }
  }

  return null;
}

// ── Module: secret-scan-gate ───────────────────────────────────────────────
// WHY: API keys were committed to git history and had to be rotated.

const SECRET_PATTERNS: SecretPattern[] = [
  { name: "AWS Access Key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "AWS Secret Key", re: /[0-9a-zA-Z/+=]{40}(?=\s|"|'|$)/, context: /aws_secret|secret_access|SECRET_KEY/i },
  { name: "Azure Storage Key", re: /[A-Za-z0-9+/]{86}==/ },
  { name: "Azure SAS Token", re: /sig=[A-Za-z0-9%+/=]{20,}/ },
  { name: "GitHub Token", re: /gh[ps]_[A-Za-z0-9_]{36,}/ },
  { name: "Generic API Key", re: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}/i },
  { name: "Generic Password", re: /(?:password|passwd|pwd)\s*[:=]\s*\\?["']?[^\s"']{8,}/i },
  { name: "Generic Token", re: /(?:token|secret|bearer)\s*[:=]\s*\\?["']?[A-Za-z0-9_\-.]{20,}/i },
  { name: "Private Key", re: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
  { name: "Connection String", re: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^\s]{20,}/ },
];

function secretScanGate(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "");
  if (!/^\s*git\s+commit/.test(cmd) && !/&&\s*git\s+commit/.test(cmd)) return null;

  let diff = "";
  try {
    diff = execFileSync("git", ["diff", "--cached", "--diff-filter=ACMR"], {
      encoding: "utf-8",
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    return null;
  }

  if (!diff) return null;

  const addedLines = diff.split("\n").filter((line) =>
    line.charAt(0) === "+" && !line.startsWith("+++")
  );

  const filteredLines = addedLines.filter((line) => {
    if (/os\.environ|process\.env|getenv|secretsmanager|get-secret-value|credential/i.test(line)) return false;
    if (/[:=]\s*["']?\s*["']?\s*$/.test(line)) return false;
    if (/\$\{?\w*TOKEN\w*[:\-}]/.test(line)) return false;
    if (/\$\{?\w*SECRET\w*[:\-}]/.test(line)) return false;
    return true;
  });
  const filteredText = filteredLines.join("\n");

  const findings: string[] = [];
  for (const pat of SECRET_PATTERNS) {
    const matchFound = filteredLines.some((line) => pat.re.test(line));
    if (matchFound) {
      if (pat.context && !pat.context.test(filteredText)) continue;
      findings.push(pat.name);
    }
  }

  if (findings.length > 0) {
    return (
      "SECRET SCAN: Potential secrets detected in staged changes:\n" +
      findings.map((f) => "  - " + f).join("\n") +
      "\nReview with: git diff --cached\n" +
      "Use environment variables or credential-manager instead of hardcoded secrets."
    );
  }

  return null;
}

// ── Module: commit-quality-gate ────────────────────────────────────────────
// WHY: Generic commit messages like "fix" or "update" make git history useless.

const GENERIC_STARTS = /^\s*(fix|update|change|modify|edit|tweak|adjust|minor|wip|tmp|temp|stuff|misc|cleanup)\b/i;
const MIN_WORDS = 5;

function commitQualityGate(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "");
  if (!/git\s+commit/.test(cmd)) return null;
  if (/--amend/.test(cmd)) return null;

  let msg = "";
  const heredocMatch = cmd.match(/-m\s+"\$\(cat\s+<<'?EOF'?\s*\n([\s\S]*?)\nEOF/);
  if (heredocMatch) {
    msg = heredocMatch[1].trim();
  } else {
    const mMatch = cmd.match(/-m\s+["']([^"']+)["']/);
    if (mMatch) msg = mMatch[1].trim();
  }

  if (!msg) return null;

  const words = msg.split(/\s+/).filter((w) => w.length > 0);

  if (words.length < MIN_WORDS) {
    return (
      `COMMIT MESSAGE TOO SHORT: ${words.length} words (min ${MIN_WORDS}).\n` +
      `Your message: "${msg}"\n` +
      'Good format: "Fix <what> — <why>" or "Add <feature> for <purpose>"'
    );
  }

  if (GENERIC_STARTS.test(msg) && words.length < 8) {
    return (
      `COMMIT MESSAGE TOO GENERIC: starts with '${words[0]}' without enough detail.\n` +
      `Your message: "${msg}"\n` +
      'Say WHAT changed and WHY. Example: "Fix spec-gate cache — stale hasUnchecked when tasks.md edited"'
    );
  }

  return null;
}

// ── Plugin Entry Point ─────────────────────────────────────────────────────

type GateFunction = (toolName: string, params: Record<string, unknown>) => string | null;

const gates: Record<string, GateFunction> = {
  "force-push-gate": forcePushGate,
  "secret-scan-gate": secretScanGate,
  "commit-quality-gate": commitQualityGate,
};

export default definePluginEntry({
  id: "hook-runner-gates",
  name: "Hook Runner Gates",
  description:
    "Ported hook-runner gate modules — blocks force-push to main, secrets in commits, and generic commit messages.",

  register(api) {
    const getConfig = (): GateConfig => {
      return (api.pluginConfig as GateConfig) || {};
    };

    api.on("before_tool_call", async (event, _ctx) => {
      const config = getConfig();
      const modules = config.modules ?? {};

      for (const [name, fn] of Object.entries(gates)) {
        if (modules[name] === false) continue;

        const reason = fn(event.toolName, event.params || {});
        if (reason) {
          return { block: true, blockReason: reason };
        }
      }

      return undefined; // allow
    });
  },
});
