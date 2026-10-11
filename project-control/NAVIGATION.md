# APCP Navigation Map

This file is the durable navigation index for APCP. Agents must navigate from repository state instead of relying on conversation memory.

## Start here

1. `CHAT_CONTINUITY.md` — recover prior session/agent context.
2. `PROJECT_STATE.md` — current durable project state.
3. `CURRENT_PHASE.md` — current phase and boundary.
4. `AUTHORIZATION.md` — what is currently authorized.
5. `NEXT_ACTION.md` — the current execution pointer.
6. `IMPLEMENTATION_PLAN.md` — current product implementation plan.
7. `VERIFICATION_STATE.md` — evidence, not intent.
8. `WORKLOG.md` — chronological history.
9. `DECISIONS.md`, `ISSUES.md`, `RISKS.md` — durable reasoning and uncertainty.
10. Multi-agent projects: `AGENT_REGISTRY.md`, `AGENT_HANDOFF.md`, `AGENT_MEMORY.md`, `AGENT_EVENTS.md`, `AGENT_BACKLOG.md`.

## Choose the prompt by intent

| User intent | Navigate to |
|---|---|
| Fresh/new chat or resume | `prompts/AUTONOMOUS_AGENT_WORK.md` |
| Continue existing project | `prompts/CONTINUE_PROJECT.md` |
| Execute current action | `prompts/IMPLEMENT_NEXT.md` |
| New requirement/change requirement | `prompts/CHANGE_REQUIREMENTS.md` |
| New feature/workstream/plan | `prompts/NEW_PLAN.md` |
| Change existing implementation | `prompts/MODIFY_IMPLEMENTATION.md` |
| Coordinate DEV/FIX/OPS | `prompts/AGENT_ORCHESTRATION.md` |
| New project initialization | `prompts/NEW_PROJECT_BOOTSTRAP.md` |
| Delegate implementation | `prompts/HANDOFF_PROJECT.md` |
| Review | `prompts/REVIEW_PROJECT.md` |
| Verify | `prompts/VERIFY_PROJECT.md` |
| Contradiction/recovery | `prompts/RECOVER_PROJECT.md` when present |
| Phase closure | `prompts/CLOSE_PHASE.md` when present |
| Governance/master behavior | `prompts/MASTER_AI_RULE.md` |
| Adaptive all-purpose control | `prompts/ADAPTIVE_PROJECT_CONTROL.md` |
| Reusable source extraction | `../source-extraction-agent/README.md`, then `prompts/00-session-recovery.md` and `EXTRACTION_AGENT_SPEC.md` |

## Adaptive decision tree

```text
Current human instruction
        |
        v
Recover repository state
        |
        v
Is this a new/changed requirement?
   | yes                 | no
   v                     v
CHANGE_REQUIREMENTS   Is it a new plan?
                         | yes          | no
                         v              v
                      NEW_PLAN      Existing work?
                                        |
                                  +-----+-----+
                                  |           |
                                 yes          no
                                  |           |
                                  v           recover/
                         IMPLEMENT_NEXT     clarify
```

For existing implementation changes, use `MODIFY_IMPLEMENTATION.md` instead of treating the change as ordinary continuation.

## Agent routing

- DEV-01 / Forge → product implementation.
- FIX-01 / Sentinel → assigned defect diagnosis/remediation.
- OPS-01 / Shipwright → CI/CD, GitHub Actions, Vercel, Docker, deployment/infrastructure.

A blocker belonging to another agent is routed through `AGENT_HANDOFF.md` and `AGENT_BACKLOG.md`; it does not transfer role ownership.

## Phase/task/checklist stops

A stop recorded in project-control is durable state. A fresh session must inspect why the work stopped and determine whether the repository already contains authorization to continue. Never infer authorization from the previous conversation.

## No-wait rule

Pending CI/CD, Vercel, deployment, review or verification is not a reason to stop independent authorized work. Route owned blockers, record pending evidence, and continue independent authorized work.

## Rules-only changes

If the user explicitly asks to update APCP rules/skills/prompts without changing product development scope, modify only governance artifacts. Do not mutate `IMPLEMENTATION_PLAN.md`, product source, phase scope or authorization unless the user explicitly requests that change.

## Fresh-chat invariant

A new AI must be able to determine role, phase, authorization, requirements, implementation state, verification state, blockers, ownership and next action from the repository alone.


## Reusable source extraction agent

For extracting reusable production-grade source from an upstream repository, use `../source-extraction-agent/README.md`. Recover that folder's project-control first, then follow its source-pinning, architecture, capability discovery, business-logic/UI tracing, recursive dependency closure, second-pass reconciliation and integrity gates. This workflow is separate from application implementation and must not alter the parent project's implementation plan unless explicitly requested.
