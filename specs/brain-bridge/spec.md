# T331: Brain Bridge — Migrate Self-Reflection to Unified Brain API

## Problem
Self-reflection.js calls `claude -p` directly for LLM analysis. This is:
- Expensive (spawns a full Claude process per Stop event)
- Stateless (no memory across sessions beyond reflection-sessions.jsonl)
- Slow (60s timeout, blocks Stop hook)

## Solution
Refactor self-reflection.js into a **thin bridge** that sends events to the unified-brain
service's `/ask` endpoint. Brain handles LLM analysis with three-tier memory (hot events →
session summaries → global patterns). Falls back to `claude -p` when brain is unavailable.

## Design
1. New `callBrain(payload)` function — HTTP POST to `http://localhost:8790/ask`
2. `callClaude()` becomes the fallback only
3. `buildPrompt()` reused for both paths (brain gets the same context)
4. Brain availability checked once per Stop (health check with 2s timeout)
5. Config: `BRAIN_URL` env var or default `http://localhost:8790`

## Non-goals
- Not changing the reflection scoring system
- Not changing the TODO-generation logic
- Not removing `claude -p` entirely (it's the fallback)
