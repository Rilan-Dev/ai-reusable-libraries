# APCP — Continue Project

Recover the project from repository state, not from conversation memory.

Read in order: repository instructions; CHAT_CONTINUITY; NEXT_ACTION; CURRENT_PHASE; AUTHORIZATION; PROJECT_STATE; IMPLEMENTATION_PLAN; relevant DECISIONS/ISSUES/RISKS/VERIFICATION_STATE; recent Git history; files named by NEXT_ACTION.

Reconcile these records with Git. Current human instructions override stale records. Do not silently repair contradictions: record a reconciliation decision. Do not guess when authorization or scope is materially ambiguous.

Before changing code establish current phase, ACTIVE authorization, exact task, acceptance criteria, constraints, evidence state and relevant risks/issues.

Use applicable Superpowers skills. Do not reimplement already-committed work. Do not expand scope because a useful future improvement was discovered.

If CI/CD is pending, continue independent authorized work; do not treat pending work as evidence.

At session end update WORKLOG and, when changed, PROJECT_STATE, CURRENT_PHASE, NEXT_ACTION, VERIFICATION_STATE and CHAT_CONTINUITY.

Never claim completion without fresh evidence for the exact claim.
## Agent-aware continuation
Identify the active agent (DEV-01 / Forge, FIX-01 / Sentinel, or OPS-01 / Shipwright), read relevant AGENT_HANDOFF/AGENT_EVENTS/AGENT_MEMORY records, and preserve the agent authority boundary.

## Adaptive scope
Do not assume initialization requirements or an old plan remain the complete scope. Reconcile any newer requirement, plan, correction or priority change against current state and Git. If scope materially changes, use the appropriate APCP change prompt and applicable Superpowers brainstorming/specification/writing-plans workflow before affected implementation.

## Learning
Record significant agent actions, failures, remedies, failed approaches and reusable DO/DO NOT lessons. Rule improvements are proposals until explicitly approved by governance.
