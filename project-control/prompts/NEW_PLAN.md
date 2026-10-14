# APCP — New Plan / Feature Prompt

Use when a new implementation plan, feature stream or major work item is introduced after project initialization.

## Prompt

Recover the current APCP state and Git. Read the governing project-control files, current plan, active authorization, recent worklog, relevant decisions/issues/risks/verification and agent memory.

Treat this as a new planning event, not as an automatic extension of the original initialization scope.

Use Superpowers brainstorming for meaningful design choices, then write and self-review the specification and use writing-plans for multi-step implementation.

Define objective, scope, non-goals, dependencies, acceptance, verification, entry/exit conditions, risks and authorization. Determine whether the work belongs in the current phase, a new phase, or a correction/reopening of an earlier phase.

Do not implement until the resulting scope has explicit active authorization. Preserve old plans and completed phases as historical records; supersede them only with an explicit record.

Create/update `IMPLEMENTATION_PLAN.md`, `PHASES.md`, `AUTHORIZATION.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md` and relevant ledgers as required.


## APCP navigation

Use `project-control/NAVIGATION.md` as the durable navigation map. Select the prompt by intent rather than relying on chat memory:
- Resume/fresh chat → `prompts/AUTONOMOUS_AGENT_WORK.md`
- Continue → `prompts/CONTINUE_PROJECT.md`
- Execute current authorized action → `prompts/IMPLEMENT_NEXT.md`
- New or changed requirement → `prompts/CHANGE_REQUIREMENTS.md`
- New feature/workstream/plan → `prompts/NEW_PLAN.md`
- Change existing implementation → `prompts/MODIFY_IMPLEMENTATION.md`
- Cross-agent assignment → `prompts/AGENT_ORCHESTRATION.md`

For phase/task/checklist stops, recover the durable stop reason and authorization from `CHAT_CONTINUITY.md`, `CURRENT_PHASE.md`, `AUTHORIZATION.md` and `NEXT_ACTION.md`; never infer continuation from a previous conversation. For rules-only changes, do not modify product scope or `IMPLEMENTATION_PLAN.md` unless explicitly requested.