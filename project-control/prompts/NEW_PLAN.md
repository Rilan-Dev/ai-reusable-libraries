# APCP — New Plan / Feature Prompt

Use when a new implementation plan, feature stream or major work item is introduced after project initialization.

## Prompt

Recover the current APCP state and Git. Read the governing project-control files, current plan, active authorization, recent worklog, relevant decisions/issues/risks/verification and agent memory.

Treat this as a new planning event, not as an automatic extension of the original initialization scope.

Use Superpowers brainstorming for meaningful design choices, then write and self-review the specification and use writing-plans for multi-step implementation.

Define objective, scope, non-goals, dependencies, acceptance, verification, entry/exit conditions, risks and authorization. Determine whether the work belongs in the current phase, a new phase, or a correction/reopening of an earlier phase.

Do not implement until the resulting scope has explicit active authorization. Preserve old plans and completed phases as historical records; supersede them only with an explicit record.

Create/update `IMPLEMENTATION_PLAN.md`, `PHASES.md`, `AUTHORIZATION.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md` and relevant ledgers as required.
