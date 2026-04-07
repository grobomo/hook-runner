# T331: Brain Bridge — Tasks

- [ ] T331a: Add `callBrain()` function — HTTP POST to brain /ask endpoint with reflection payload
- [ ] T331b: Add `isBrainAvailable()` health check — GET /healthz with 2s timeout, cached per invocation
- [ ] T331c: Refactor main flow — try brain first, fall back to claude -p, log which path was used
- [ ] T331d: Add tests — mock brain endpoint, verify fallback, verify payload format
- [ ] T331e: Sync to live hooks + run-modules, version bump, CHANGELOG
