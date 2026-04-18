// T475: E2E test harness — loads the actual OpenClaw plugin via its real SDK
// and exercises before_tool_call through the register(api) → api.on() pattern.
// Run in WSL: NODE_PATH=/usr/lib/node_modules npx tsx scripts/test/e2e-tsx-harness.ts

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

// Verify SDK import works
if (typeof definePluginEntry !== "function") {
  console.log("FAIL: definePluginEntry not a function — SDK import broken");
  process.exit(1);
}

// ── Load plugin ──────────────────────────────────────────────────────────
// Import the plugin source — definePluginEntry returns { id, register, ... }
import pluginExport from "../../openclaw-plugin/index.ts";
const plugin = pluginExport;

if (!plugin || typeof plugin.register !== "function") {
  console.log("FAIL: plugin.register is not a function");
  console.log("  got:", Object.keys(plugin || {}));
  process.exit(1);
}

// ── Mock the plugin API to capture the before_tool_call handler ──────────
type Handler = (event: any, ctx: any) => Promise<any>;
let capturedHandler: Handler | null = null;
let currentConfig: Record<string, any> = {};

const mockApi = {
  on(eventName: string, handler: Handler) {
    if (eventName === "before_tool_call") {
      capturedHandler = handler;
    }
  },
  get pluginConfig() {
    return currentConfig;
  },
};

plugin.register(mockApi as any);

if (!capturedHandler) {
  console.log("FAIL: plugin did not register a before_tool_call handler");
  process.exit(1);
}

console.log("OK: plugin loaded and before_tool_call handler captured");

// ── Test cases ───────────────────────────────────────────────────────────

interface TC {
  name: string;
  toolName: string;
  params: Record<string, unknown>;
  expectBlock: boolean;
  reasonContains?: string;
  modules?: Record<string, boolean>;
}

const cases: TC[] = [
  // ── force-push-gate ──
  {
    name: "force-push to main: blocked",
    toolName: "Bash",
    params: { command: "git push --force origin main" },
    expectBlock: true,
    reasonContains: "Force-push to main",
  },
  {
    name: "force-push to master: blocked",
    toolName: "Bash",
    params: { command: "git push -f origin master" },
    expectBlock: true,
    reasonContains: "Force-push to master",
  },
  {
    name: "force-push to feature: allowed",
    toolName: "Bash",
    params: { command: "git push --force origin feature-xyz" },
    expectBlock: false,
  },
  {
    name: "regular push to main: allowed",
    toolName: "Bash",
    params: { command: "git push origin main" },
    expectBlock: false,
  },
  {
    name: "force-with-lease to main: blocked",
    toolName: "Bash",
    params: { command: "git push --force-with-lease origin main" },
    expectBlock: true,
    reasonContains: "Force-push to main",
  },

  // ── commit-quality-gate ──
  {
    name: "short commit msg (2 words): blocked",
    toolName: "Bash",
    params: { command: "git commit -m 'fix bug'" },
    expectBlock: true,
    reasonContains: "TOO SHORT",
  },
  {
    name: "generic commit msg (6 words): blocked",
    toolName: "Bash",
    params: { command: "git commit -m 'update the config file for deploy setup'" },
    expectBlock: true,
    reasonContains: "TOO GENERIC",
  },
  {
    name: "good commit msg: allowed",
    toolName: "Bash",
    params: {
      command:
        "git commit -m 'Fix spec-gate cache invalidation when tasks.md is edited externally'",
    },
    expectBlock: false,
  },
  {
    name: "amend commit: allowed",
    toolName: "Bash",
    params: { command: "git commit --amend -m 'wip'" },
    expectBlock: false,
  },

  // ── secret-scan-gate (no staged changes, should allow) ──
  {
    name: "git commit (no staged diff): allowed",
    toolName: "Bash",
    params: { command: "git commit -m 'T475: Test commit with enough words for quality gate'" },
    expectBlock: false,
  },

  // ── non-Bash tools: always allowed ──
  {
    name: "non-commit Bash: allowed",
    toolName: "Bash",
    params: { command: "ls -la" },
    expectBlock: false,
  },
  {
    name: "Read tool: allowed",
    toolName: "Read",
    params: { file_path: "/etc/passwd" },
    expectBlock: false,
  },
  {
    name: "Write tool: allowed",
    toolName: "Write",
    params: { file_path: "/tmp/t.txt", content: "hi" },
    expectBlock: false,
  },
  {
    name: "Edit tool: allowed",
    toolName: "Edit",
    params: { file_path: "/tmp/t.txt", old_string: "a", new_string: "b" },
    expectBlock: false,
  },

  // ── config: disable a gate ──
  {
    name: "disabled force-push-gate: allowed",
    toolName: "Bash",
    params: { command: "git push --force origin main" },
    expectBlock: false,
    modules: { "force-push-gate": false },
  },
  {
    name: "disabled commit-quality-gate: allowed",
    toolName: "Bash",
    params: { command: "git commit -m 'wip'" },
    expectBlock: false,
    modules: { "commit-quality-gate": false },
  },
];

// ── Run tests ────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

async function runTests() {
  for (const tc of cases) {
    // Set config for this test case
    currentConfig = tc.modules ? { modules: tc.modules } : {};

    const event = { toolName: tc.toolName, params: tc.params };
    const ctx = {};

    let result: any;
    try {
      result = await capturedHandler!(event, ctx);
    } catch (err: any) {
      console.log(`FAIL: ${tc.name} — handler threw: ${err.message}`);
      fail++;
      continue;
    }

    const blocked = result?.block === true;

    if (blocked !== tc.expectBlock) {
      console.log(
        `FAIL: ${tc.name} — expected ${tc.expectBlock ? "block" : "allow"}, got ${blocked ? "block" : "allow"}`
      );
      if (result?.blockReason)
        console.log(`  reason: ${result.blockReason.split("\n")[0]}`);
      fail++;
      continue;
    }

    if (tc.reasonContains && blocked && result?.blockReason) {
      if (!result.blockReason.includes(tc.reasonContains)) {
        console.log(
          `FAIL: ${tc.name} — reason missing "${tc.reasonContains}"`
        );
        console.log(`  got: ${result.blockReason.split("\n")[0]}`);
        fail++;
        continue;
      }
    }

    console.log(`OK: ${tc.name}`);
    pass++;
  }

  console.log("");
  console.log(`--- tsx gate tests: ${pass}/${pass + fail} passed ---`);
  if (fail > 0) process.exit(1);
}

runTests();
