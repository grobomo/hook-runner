# Test Monitoring Against Known-Bad Projects First

When building a monitoring/enforcement system (e.g. workflow compliance monitor):

1. **Find a real known-bad project first** — don't just design the monitor in isolation
2. **Run the monitor against it immediately** to prove it catches violations
3. **The user cares about proof of detection**, not architecture diagrams
4. A monitor that isn't validated against a real failure is untested code

Example: ddei-email-security was not following SHTD — use it as the
first test target for any SHTD compliance monitor, not a hypothetical.
