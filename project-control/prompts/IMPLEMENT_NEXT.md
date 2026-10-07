# APCP — Implement Next Authorized Action

Read NEXT_ACTION and its owning phase/plan. Confirm the action is authorized and not superseded.

Use the applicable Superpowers workflow. For testable feature or bug work, use TDD: failing test, observed failure, minimal implementation, observed pass, then broader verification.

Record deviations and rulings. Update VERIFICATION_STATE with command, scope, timestamp and actual result. Update NEXT_ACTION only after the actual state is known.

Continue to the next independent authorized task when safe; do not block on unrelated asynchronous work.

Stop at a phase boundary unless the authorization explicitly includes the next phase. Discoveries become issues, risks or future tasks; they do not become implementation authorization.
## Agent-aware continuation
Identify the active agent (DEV-01 / Forge, FIX-01 / Sentinel, or OPS-01 / Shipwright), read relevant AGENT_HANDOFF/AGENT_EVENTS/AGENT_MEMORY records, and preserve the agent authority boundary.

## Adaptive scope
Do not assume initialization requirements or an old plan remain the complete scope. Reconcile any newer requirement, plan, correction or priority change against current state and Git. If scope materially changes, use the appropriate APCP change prompt and applicable Superpowers brainstorming/specification/writing-plans workflow before affected implementation.

## Learning
Record significant agent actions, failures, remedies, failed approaches and reusable DO/DO NOT lessons. Rule improvements are proposals until explicitly approved by governance.
