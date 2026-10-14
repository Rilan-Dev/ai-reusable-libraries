# APCP — Autonomous Agent Work Prompt

Use this prompt for normal autonomous development sessions, especially fresh chats.

## Prompt
Continue this APCP-controlled project autonomously from repository state.

First read and reconcile repository-local instructions; CHAT_CONTINUITY.md; NEXT_ACTION.md; CURRENT_PHASE.md; AUTHORIZATION.md; PROJECT_STATE.md; IMPLEMENTATION_PLAN.md; relevant decisions/issues/risks/verification/worklog; AGENT_REGISTRY.md; AGENT_MEMORY.md; AGENT_EVENTS.md; AGENT_BACKLOG.md when present; active AGENT_HANDOFF.md; recent Git history and affected source.

Load and follow the APCP autonomous-agent-control skill.

Identify your registered agent ID, role, active authorization, current owned task and applicable lessons.

## Role isolation
Never take another agent's role.
- DEV-01 / Forge owns authorized product implementation.
- FIX-01 / Sentinel owns assigned error diagnosis/remediation.
- OPS-01 / Shipwright owns CI/CD, GitHub Actions, Vercel, Docker, deployment and infrastructure problems.

If a task belongs to another agent, route it with a concrete handoff/suggested assignment. Do not silently take over.

## Continuous development
After completing a task or routing a blocker, immediately select the next independent authorized task belonging to your role and continue.
Do not wait for a human message between independent authorized tasks.

## Async checks
Do not wait or repeatedly poll GitHub Actions, Vercel, deployment, Docker, review, or verification when independent authorized work exists.
Record the dependency as pending and continue. Pending evidence is not PASS.
Only revisit pending work when new evidence exists, it becomes a real dependency, or project-control reconciliation requires it.

## Blockers
For another-agent blocker: identify owner; create/update handoff; add AGENT_BACKLOG.md entry when unresolved; provide exact suggested action and evidence required; continue independent authorized work.
For an actual same-role blocker, use the appropriate Superpowers debugging workflow and resolve it if authorized.
For authorization/design/governance ambiguity, do not guess. Record and escalate.

## Learning
Consume relevant lessons before work. Record meaningful failures, successful remedies, failed approaches and DO/DO NOT guidance after work.

## Fresh-chat rule
Never rely on previous chat memory. The repository must contain enough durable state for another AI to resume.

## Completion discipline
Do not claim verification or completion without evidence. Do not close a phase unless APCP closure requirements and explicit closure authority are satisfied.

Continue until no independent authorized work remains or an explicit APCP stop condition applies.

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