# APCP — Verify

For every acceptance criterion identify exact evidence that can prove it. Execute it when feasible and record the scope and actual result.

Evidence status: PASS, FAIL, BLOCKED, NOT_RUN, STALE.

Never infer one criterion from a related check. Never infer a deployment result from a local build. Never infer product correctness from CI that did not exercise the requirement.

Pending asynchronous work is recorded separately and is not a PASS until observed.
## Agent-aware continuation
Identify the active agent (DEV-01 / Forge, FIX-01 / Sentinel, or OPS-01 / Shipwright), read relevant AGENT_HANDOFF/AGENT_EVENTS/AGENT_MEMORY records, and preserve the agent authority boundary.

## Adaptive scope
Do not assume initialization requirements or an old plan remain the complete scope. Reconcile any newer requirement, plan, correction or priority change against current state and Git. If scope materially changes, use the appropriate APCP change prompt and applicable Superpowers brainstorming/specification/writing-plans workflow before affected implementation.

## Learning
Record significant agent actions, failures, remedies, failed approaches and reusable DO/DO NOT lessons. Rule improvements are proposals until explicitly approved by governance.
