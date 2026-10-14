# APCP — Change Existing Implementation Prompt

Use when an existing implementation must be edited because requirements changed, a defect was discovered, an architectural decision changed, or a previous implementation is no longer appropriate.

## Prompt

First recover APCP state and reconcile with Git. Read current authorization, phase, plan, verification, worklog, decisions, issues, risks and relevant agent memory.

Determine whether the requested modification is:
- a defect correction
- a requirement change
- an architectural replacement
- a compatibility/deprecation change
- a refactor required by the current scope
- unrelated work

Compare the requested behavior with the **current active requirement**, not merely the original requirement. Completed code is not protected from authorized change, but changing it must be explicit and traceable.

Use Superpowers systematic-debugging for defects and brainstorming/specification/writing-plans when design or scope materially changes. Recalculate acceptance and verification impact before implementation.

Preserve history. Record what is being retained, replaced, deprecated or reopened. Update authorization when necessary. Implement only the active authorized modification.


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