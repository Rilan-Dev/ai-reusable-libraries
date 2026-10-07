# APCP — Requirement / Scope Change Prompt

Use when a user introduces a new requirement, changes an existing requirement, replaces scope, or changes priorities after initialization.

## Prompt

Recover APCP from the repository and Git before changing code. Read `CHAT_CONTINUITY.md`, `NEXT_ACTION.md`, `CURRENT_PHASE.md`, `AUTHORIZATION.md`, `PROJECT_STATE.md`, `IMPLEMENTATION_PLAN.md`, relevant decisions/issues/risks/verification, recent `WORKLOG.md`, and applicable `AGENT_MEMORY.md`.

Classify the requested change as **additive, modifying, corrective, superseding, reprioritizing, or unrelated**.

Analyze its impact on:
- product requirements and non-goals
- current and completed phases
- architecture/interfaces/data model
- security/tenancy/reliability
- acceptance and verification criteria
- active authorization and phase boundary
- current implementation and pending work
- CI/CD/deployment dependencies

Do not implement yet if the change materially alters the approved design, phase scope or authorization. Use Superpowers brainstorming/specification/writing-plans as applicable, and create a change plan when the work is non-trivial.

Preserve historical records. Do not delete completed work or old decisions. Explicitly supersede affected plan/authorization records and state what remains valid, what is replaced, and what must be reopened or corrected.

After the impact decision, establish the updated plan and explicit authorization. Then create exactly one new `NEXT_ACTION` inside the active scope.

Only after authorization may Forge/Sentinel/Shipwright implement the changed scope.
