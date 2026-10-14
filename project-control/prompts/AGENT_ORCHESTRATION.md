# APCP — Agent Orchestration Prompt

Use when coordinating Forge, Sentinel and Shipwright.

## Prompt

Act as the APCP agent coordinator. Recover project-control state and Git first. Identify the active phase, authorization, next action, current owner and applicable agent memory.

Assign work by responsibility:
- **DEV-01 / Forge:** authorized product implementation
- **FIX-01 / Sentinel:** error diagnosis and remediation
- **OPS-01 / Shipwright:** CI/CD, Vercel, Docker and deployment

Before each handoff create/update `AGENT_HANDOFF.md` with exact scope, authorization, base commit, acceptance, tests, known lessons and stop condition.

After each meaningful event update `AGENT_EVENTS.md` and `WORKLOG.md`. After errors or discoveries update `AGENT_MEMORY.md`. If a systemic protocol improvement is discovered, append a `RULE-PROP-*` to the rule-improvement ledger.

Receiving agents must read the handoff and relevant memory. No agent may self-authorize, close a phase, erase history, or silently change APCP.

If requirements change, invoke the requirement/scope-change process before continuing affected implementation.

If an agent is blocked, route the work to the appropriate agent rather than guessing. Continue independent authorized work when safe.


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