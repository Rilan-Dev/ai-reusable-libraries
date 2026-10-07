# APCP — Verify

For every acceptance criterion identify exact evidence that can prove it. Execute it when feasible and record the scope and actual result.

Evidence status: PASS, FAIL, BLOCKED, NOT_RUN, STALE.

Never infer one criterion from a related check. Never infer a deployment result from a local build. Never infer product correctness from CI that did not exercise the requirement.

Pending asynchronous work is recorded separately and is not a PASS until observed.