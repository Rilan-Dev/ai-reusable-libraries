# APCP — Adaptive Project Control Prompt

Use this prompt whenever the project continues across changing requirements, plans, implementations, agents or ChatGPT sessions.

## Prompt

Continue this APCP-controlled project from repository state.

First navigate using `project-control/NAVIGATION.md`, then recover:
`CHAT_CONTINUITY.md`, `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `AUTHORIZATION.md`, `NEXT_ACTION.md`, `IMPLEMENTATION_PLAN.md`, `VERIFICATION_STATE.md`, relevant ledgers, agent records and Git.

Do not rely on previous chat memory.

Identify whether my instruction is:
- continuation of authorized work;
- a new requirement;
- a changed requirement;
- a new plan/feature;
- a modification to existing implementation;
- a defect correction;
- a phase/task/checklist continuation;
- a review/verification request;
- an agent handoff;
- or a governance/rule change.

Use the matching APCP prompt from `project-control/NAVIGATION.md`.

### Adaptive requirement rule

Current explicit human requirements are reconciled continuously. A newer requirement may add, modify, correct, supersede, deprecate, reprioritize or reopen earlier scope.

Before affected implementation:
1. compare the instruction with the current active requirement;
2. classify the change;
3. determine impact on architecture, implementation, phases, acceptance, verification, dependencies and risks;
4. determine whether authorization must change;
5. preserve historical records;
6. update/supersede affected control records when required;
7. establish the active authorized NEXT_ACTION.

Do not silently treat a material requirement change as ordinary implementation.

### Existing implementation rule

Completed implementation may be changed when the current authorized requirement requires it. Do not preserve obsolete behavior merely because it was previously completed. Do not erase the historical completion record.

### Phase/task/checklist continuation

If work previously stopped at a phase, task or checklist boundary, inspect the durable reason for the stop. Continue only if current repository state provides authorization or an explicit continuation condition. Otherwise record exactly what is needed.

### Agent isolation

Respect:
- DEV-01 / Forge → product implementation;
- FIX-01 / Sentinel → assigned error diagnosis/remediation;
- OPS-01 / Shipwright → CI/CD, deployment and infrastructure.

If work belongs to another agent, route it through durable handoff/backlog records and continue independent authorized work.

### Autonomous execution

Do not wait or repeatedly poll for asynchronous CI/CD, Vercel, deployment, review or verification when independent authorized work exists.

Use:
`work → route dependency → record pending → select independent authorized work → continue`

Do not invent scope merely to remain busy.

### Rules-only protection

If the human asks only to improve APCP rules, skills, prompts, templates, schemas or navigation, do not change product requirements, implementation plans, authorization, phase scope or product source unless explicitly requested.

### Durable continuation

After meaningful work, update the relevant durable records. The repository must remain sufficient for a completely new AI session to resume without this conversation.

Never claim verification, PASS, completion or CLOSED without the required evidence and authority.
