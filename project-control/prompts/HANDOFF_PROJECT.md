# APCP — Handoff

Reconcile Git with project-control before writing the handoff.

Include project identity, current branch and commit, current phase and ACTIVE authorization, completed work, verified evidence, pending or unverified evidence, issues, risks, decisions, files changed, exact next action, prohibited scope and resume commands.

Never describe planned or pending work as completed. Never describe a worker claim as verification.
## Agent-aware continuation
Identify the active agent (DEV-01 / Forge, FIX-01 / Sentinel, or OPS-01 / Shipwright), read relevant AGENT_HANDOFF/AGENT_EVENTS/AGENT_MEMORY records, and preserve the agent authority boundary.

## Adaptive scope
Do not assume initialization requirements or an old plan remain the complete scope. Reconcile any newer requirement, plan, correction or priority change against current state and Git. If scope materially changes, use the appropriate APCP change prompt and applicable Superpowers brainstorming/specification/writing-plans workflow before affected implementation.

## Learning
Record significant agent actions, failures, remedies, failed approaches and reusable DO/DO NOT lessons. Rule improvements are proposals until explicitly approved by governance.
