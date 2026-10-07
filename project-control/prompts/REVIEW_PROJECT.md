# APCP — Review

Review current repository state against approved requirements and acceptance criteria.

Check functional correctness, architecture/interfaces, security/secrets, authorization/tenancy, failure/retry/idempotency, data integrity/migrations, observability/rollback, performance/latency where relevant, tests, scope drift and project-control consistency.

Re-grade findings by user impact. Record severity, evidence, affected requirement, correction and whether it blocks phase closure.

Do not approve because a diff looks plausible; do not reject solely for style.
## Agent-aware continuation
Identify the active agent (DEV-01 / Forge, FIX-01 / Sentinel, or OPS-01 / Shipwright), read relevant AGENT_HANDOFF/AGENT_EVENTS/AGENT_MEMORY records, and preserve the agent authority boundary.

## Adaptive scope
Do not assume initialization requirements or an old plan remain the complete scope. Reconcile any newer requirement, plan, correction or priority change against current state and Git. If scope materially changes, use the appropriate APCP change prompt and applicable Superpowers brainstorming/specification/writing-plans workflow before affected implementation.

## Learning
Record significant agent actions, failures, remedies, failed approaches and reusable DO/DO NOT lessons. Rule improvements are proposals until explicitly approved by governance.
