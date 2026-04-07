# T331: Brain Bridge — Tasks

- [x] T331a: Add `callBrain()` function — HTTP POST to brain /ask endpoint with reflection payload (PR #227)
- [x] T331b: Add `isBrainAvailable()` health check — GET /healthz with 2s timeout, cached per invocation (PR #227)
- [x] T331c: Refactor main flow — try brain first, fall back to claude -p, log which path was used (PR #227)
- [x] T331d: Add tests — mock brain endpoint, verify fallback, verify payload format (PR #227)
- [x] T331e: Sync to live hooks + run-modules, version bump, CHANGELOG (PR #228, #229)
