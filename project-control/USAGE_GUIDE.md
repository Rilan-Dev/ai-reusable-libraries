# APCP Usage Guide — What to Do and What to Type

You should **not need to memorize APCP**.

Use this file as the practical cheat sheet. When you are unsure what to tell the AI, choose the situation below and copy the example prompt.

## 1. The only thing to remember

For a **new project**, point the AI to:

`Rilan-Dev/ai-reusable-libraries/project-control/prompts/NEW_PROJECT_BOOTSTRAP.md`

Then add your product requirements underneath.

For an **existing APCP project**, tell the AI to read:

`docs/project-control/CHAT_CONTINUITY.md`
`docs/project-control/NEXT_ACTION.md`
`docs/project-control/CURRENT_PHASE.md`
`docs/project-control/AUTHORIZATION.md`

Then ask it to continue the next authorized action.

You do not need to remember the individual APCP rules.

---

# 2. New project — first conversation

## What you do

Give the AI the reusable bootstrap prompt and your product requirements.

## Copy-paste example

```text
Use the APCP framework from:

Rilan-Dev/ai-reusable-libraries/project-control/prompts/NEW_PROJECT_BOOTSTRAP.md

First read the actual APCP files from:
Rilan-Dev/ai-reusable-libraries/project-control/

Do not rely on memory. Bootstrap this NEW project using APCP and Superpowers.

My project requirements are:

[PASTE MY PRODUCT REQUIREMENTS HERE]

For this first session:
- initialize/reconcile docs/project-control/
- understand the product and architecture
- inspect the repository thoroughly
- create the implementation phases
- establish explicit authorization
- create the first NEXT_ACTION
- do not start future implementation that is not authorized
- make the repository self-contained so a fresh AI can continue later

After initialization, report the current phase, authorization, risks, issues, decisions, verification state, and exactly one next action.
```

## Important

Do **not** tell the AI:

> "Just build the whole project."

Instead, let APCP establish the project phases and authorization first.

---

# 3. Your common action item — "Proceed with the next"

This is the most important everyday example.

You do not need to remember the phase number or APCP rules.

## Copy-paste

```text
Proceed with the next authorized implementation work.

First read and reconcile:
- docs/project-control/CHAT_CONTINUITY.md
- docs/project-control/NEXT_ACTION.md
- docs/project-control/CURRENT_PHASE.md
- docs/project-control/AUTHORIZATION.md
- docs/project-control/PROJECT_STATE.md
- docs/project-control/IMPLEMENTATION_PLAN.md

Follow APCP and the applicable Superpowers workflow.

Use the repository/Git state as authority. Do not guess missing state.

Continue the current authorized work, implement the next action, test it appropriately, update the project-control records, and then determine the next authorized action.

Do not silently expand scope.

Do not stop merely because GitHub Actions, Vercel, or another asynchronous check is still pending if independent authorized work can continue.

Do not claim pending verification passed.

If the current action is blocked or authorization is unclear, do not guess; record the blocker and explain exactly what is needed.
```

This is the normal **"Please proceed"** command.

---

# 4. "Please proceed" — shorter version

Once the project is mature and APCP is already established, you can use:

```text
Please proceed with the next authorized work.

Read docs/project-control/CHAT_CONTINUITY.md and NEXT_ACTION.md first, reconcile with Git, follow APCP + Superpowers, implement the next authorized item, update project-control, and continue to the next independent authorized item.

Do not silently expand scope or falsely claim verification.
```

---

# 5. You want the AI to keep developing instead of waiting for CI/Vercel

Use this when you see the AI stopping because a build or GitHub Actions job is running.

```text
Do not wait for GitHub Actions, Vercel builds, deployment completion, or other asynchronous checks when they are not required for the next independent authorized task.

Continue the next independent authorized implementation work.

Keep pending checks recorded as pending evidence. Do not claim they passed and do not close a phase using pending evidence.

Only stop when the pending result is actually a dependency for the work or when APCP authorization/scope requires stopping.
```

This implements the APCP async rule.

---

# 6. You want planning only — no implementation yet

Use this when you are still designing the product.

```text
Use APCP + Superpowers.

Do planning and architecture only. Do not implement product code yet.

Inspect the repository and requirements, identify assumptions and unresolved decisions, define the architecture, create the phased implementation plan, define acceptance and verification criteria, and prepare the authorization boundary.

Stop before implementation and report what would need explicit authorization next.
```

A plan is **not** permission to implement everything in that plan.

---

# 7. You want to authorize the next phase

Use this when you have reviewed the plan and want development to start.

```text
I authorize implementation of the current phase.

Before changing code, reconcile:
- CURRENT_PHASE.md
- AUTHORIZATION.md
- NEXT_ACTION.md
- PROJECT_STATE.md
- Git state

Record this authorization with the exact scope, non-scope, acceptance criteria, required verification, actor, and phase boundary.

Then implement only the authorized scope using the appropriate Superpowers workflow.

Do not implement future phases or unrelated improvements.
```

---

# 8. Another AI/developer/Z.AI should implement it

Use:

```text
Prepare the implementation handoff for the current authorized phase.

Read the APCP project-control state and create/update ZAI_HANDOFF.md.

The handoff must include:
- project
- phase
- authorization ID
- base commit
- exact task
- allowed scope
- prohibited changes
- acceptance criteria
- required tests
- known risks/issues
- stop condition
- required hand-back information

The implementer must stop at the phase boundary.

Do not treat the implementer's completion claim as verification or phase closure.
```

---

# 9. The other AI says "done"

Do not simply accept "done".

Use:

```text
Do not mark the phase complete based on the implementation claim alone.

Act as the independent reviewer/verifier.

Read the authorized scope and acceptance criteria, inspect the actual Git diff, review the implementation, run the appropriate verification, update VERIFICATION_STATE.md with evidence, identify any scope drift or defects, and report what is actually verified versus still pending.

Do not close the phase yet unless the APCP closure requirements and explicit closure authority are satisfied.
```

---

# 10. You want a code review

```text
Review the current authorized implementation against the project requirements and APCP.

Inspect:
- functional correctness
- architecture/interfaces
- security
- authentication/authorization
- tenant/ownership isolation
- failure/retry/idempotency
- migrations/data integrity
- observability
- performance/latency
- tests
- scope drift
- project-control consistency

Use the appropriate Superpowers review workflow.

Separate findings into critical/important/minor where useful, and give concrete corrective actions.

Do not assume passing tests prove architectural correctness.
```

---

# 11. You want verification only

```text
Verify the current phase against every acceptance criterion.

Use VERIFICATION_STATE.md as the evidence ledger.

For each criterion record:
- PASS
- FAIL
- BLOCKED
- NOT_RUN
- STALE

Use actual commands and evidence.

Do not infer deployment from a local build, do not infer full-project correctness from unrelated CI, and do not treat pending checks as PASS.

Report exactly what is verified and what remains unverified.
```

---

# 12. You believe the phase is finished

Use this before saying "close this phase".

```text
Prepare the current phase for closure.

Follow APCP CLOSE_PHASE.md.

Reconcile:
- authorized scope
- implementation
- Git state
- acceptance criteria
- verification evidence
- review findings
- issues
- risks
- decisions
- project-control documents

Identify anything still missing or stale.

Do not close the phase automatically. If all closure conditions are satisfied, prepare the closure record and state exactly what explicit closure authority is required.
```

---

# 13. You want to explicitly close the phase

Only use this after reviewing the evidence.

```text
I explicitly authorize closure of the current phase, provided APCP closure requirements are satisfied.

Perform the final closure check:
- every acceptance criterion has current evidence
- required verification is complete
- review findings are resolved or explicitly dispositioned
- scope is reconciled
- follow-ups are recorded
- Git state is recorded
- project-control documents agree

If all requirements pass, mark the phase CLOSED and update all required control records.

If any requirement does not pass, do not force closure. Report the exact remaining blocker.
```

---

# 14. Fresh chat / new AI conversation

This is extremely important.

You do **not** need to explain the entire project again.

Use:

```text
This is a continuation of an existing APCP-controlled project.

Do not rely on previous chat memory.

First recover the project from the repository.

Read:
1. repository-local instructions
2. docs/project-control/CHAT_CONTINUITY.md
3. docs/project-control/NEXT_ACTION.md
4. docs/project-control/CURRENT_PHASE.md
5. docs/project-control/AUTHORIZATION.md
6. docs/project-control/PROJECT_STATE.md
7. docs/project-control/IMPLEMENTATION_PLAN.md
8. relevant DECISIONS.md, ISSUES.md, RISKS.md, VERIFICATION_STATE.md, WORKLOG.md
9. recent Git history and the affected source files

Reconcile all of this with the current Git state.

Then continue only the next authorized action.

Do not guess missing state and do not silently repair contradictions.
```

This is the normal **new-chat continuation command**.

---

# 15. Something looks inconsistent or wrong

For example:

- control docs say one thing
- Git says another
- an old AI claimed something was complete
- a phase says VERIFIED but evidence is missing
- authorization does not match the current work

Use:

```text
There may be an APCP state contradiction.

Do not make implementation changes yet.

Follow RECOVER_PROJECT.md.

Identify:
- the conflicting records
- the authority hierarchy
- current Git/source evidence
- whether authorization is affected
- whether previous verification is stale
- whether completion/closure claims are invalid

Preserve historical records, append the reconciliation decision, invalidate stale evidence where necessary, and establish the safest next action.

If authority cannot be established, mark the work BLOCKED and tell me what decision is required.
```

---

# 16. You want the AI to self-critique

Use:

```text
Before considering this work complete, perform a deliberate APCP self-critique.

Challenge:
- requirements coverage
- assumptions
- scope drift
- authorization
- security
- secrets
- authentication/authorization
- tenant/ownership isolation
- race conditions
- retries/idempotency
- failure recovery
- data integrity/migrations
- provider/API compatibility
- observability
- latency/performance
- tests
- verification quality
- rollback/recovery
- overengineering
- underengineering

If you find a defect, record it and fix it only if the fix is inside current authorization. Otherwise record it as a follow-up or blocker.
```

---

# 17. You want to change the product requirement mid-project

Do not just say "also add this".

Use:

```text
I am proposing a requirement change:

[DESCRIBE CHANGE]

Do not immediately implement it.

First determine whether this changes:
- current phase scope
- authorization
- architecture
- acceptance criteria
- dependencies
- security/tenancy
- verification
- timeline/order of phases

Record the decision appropriately in DECISIONS.md and update the implementation plan/authorization only after the scope change is explicitly resolved.

Then tell me whether it can be handled inside the current authorization or requires a new authorization/phase.
```

This prevents accidental scope expansion.

---

# 18. The simplest everyday commands

If you do not remember anything else, these are enough.

### Start a new project

```text
Use Rilan-Dev/ai-reusable-libraries/project-control/prompts/NEW_PROJECT_BOOTSTRAP.md to initialize this project under APCP.

My requirements are:

[REQUIREMENTS]

Initialize the project-control state first. Do not implement future work without authorization.
```

### Continue development

```text
Please proceed with the next authorized work. Read docs/project-control/CHAT_CONTINUITY.md and NEXT_ACTION.md first, reconcile with Git, follow APCP + Superpowers, implement the next action, update project-control, and continue independent authorized work.
```

### Fresh chat

```text
Recover this APCP project from docs/project-control and Git. Read CHAT_CONTINUITY.md, NEXT_ACTION.md, CURRENT_PHASE.md, AUTHORIZATION.md, and PROJECT_STATE.md first. Reconcile state, then continue the next authorized action.
```

### Review

```text
Review the current implementation against APCP, the authorized scope, requirements, security, architecture, reliability, tests, and Git diff. Report findings and corrective actions; do not assume implementation means verified.
```

### Verify

```text
Verify every current acceptance criterion using actual evidence and update VERIFICATION_STATE.md. Separate PASS, FAIL, BLOCKED, NOT_RUN, and STALE. Do not claim anything that was not actually verified.
```

### Close

```text
Prepare the current phase for APCP closure. Check scope, acceptance, verification, review findings, Git state, and project-control consistency. Do not close unless all requirements and explicit closure authority are satisfied.
```

---

# 19. How APCP files relate to each other

Think of them like this:

| File | Simple meaning |
|---|---|
| PROJECT_STATE.md | Where the project is |
| CURRENT_PHASE.md | What phase we are in |
| AUTHORIZATION.md | What we are allowed to do |
| NEXT_ACTION.md | What we should do next |
| IMPLEMENTATION_PLAN.md | Where the project is going |
| PHASES.md | How the project is divided |
| CHAT_CONTINUITY.md | How a fresh AI catches up |
| VERIFICATION_STATE.md | What is actually proven |
| DECISIONS.md | Why important choices were made |
| ISSUES.md | Known problems |
| RISKS.md | Known uncertainty/exposure |
| WORKLOG.md | What happened over time |
| ZAI_HANDOFF.md | What a delegated implementer is allowed to do |

### The most important four

If you are in a hurry, remember only:

**AUTHORIZATION → CURRENT_PHASE → NEXT_ACTION → VERIFICATION_STATE**

That answers:

> Am I allowed to do it?

> What phase am I in?

> What should I do now?

> What is actually proven?

---

# 20. The mental model

You can think of APCP as:

```text
PLAN
  ↓
AUTHORIZE
  ↓
IMPLEMENT
  ↓
REVIEW
  ↓
VERIFY
  ↓
CLOSE
```

And the repository records the state at every step.

The AI should never jump silently from:

```planned → implemented → closed
```

without authorization and evidence.

---

# 21. Recommended workflow for your projects

For your normal projects, use this pattern:

### Session 1 — Initialize

Use `NEW_PROJECT_BOOTSTRAP.md`.

Goal:

```text
Requirements
→ reconnaissance
→ architecture
→ phased plan
→ project-control
→ authorization boundary
→ NEXT_ACTION
```

### Development sessions

Use:

```text
"Please proceed with the next authorized work..."
```

The AI reads the repository and continues from `NEXT_ACTION.md`.

### When delegating to Z.AI

Use:

```text
"Prepare the implementation handoff..."
```

Then Z.AI works only inside `ZAI_HANDOFF.md`.

### When Z.AI returns

Use review + verification.

### Before phase completion

Use:

```text
"Prepare the current phase for APCP closure..."
```

### New ChatGPT conversation

Use:

```text
"Recover this APCP project from docs/project-control and Git..."
```

You should not need to explain the entire previous conversation again.

---

# 22. What you should NOT have to remember

You do not need to memorize:

- every APCP filename
- every state transition
- every verification rule
- every Superpowers skill
- every handoff field
- every closure condition

The repository is supposed to contain those rules.

Your normal interaction can remain simple:

**"Start this project with APCP."**

**"Proceed with the next authorized work."**

**"Review this."**

**"Verify this."**

**"Prepare this phase for closure."**

**"Recover this project from the repository."**

The AI is responsible for reading the appropriate APCP documents and applying the detailed rules.

---

# 23. Rule of thumb

If you are unsure what to type:

1. Say what outcome you want.
2. Tell the AI to read APCP project-control state first.
3. Tell it not to guess.
4. Tell it to stay inside authorization.
5. Tell it to update project-control.
6. Tell it not to claim unverified work.

Example:

```text
I want [OUTCOME].

First recover the APCP project state from docs/project-control and Git.

Determine the next authorized action needed for this outcome.

Implement only authorized work, use Superpowers, verify appropriately, update the project-control records, and tell me what is actually complete versus pending.

Do not guess, silently expand scope, or claim unverified work.
```

That single pattern is enough for most day-to-day work.

## 22. Multi-agent development
APCP now supports a default three-agent team:
- Forge (DEV-01): builds authorized product work.
- Sentinel (FIX-01): diagnoses and fixes errors.
- Shipwright (OPS-01): handles CI/CD, Vercel, Docker and deployment problems.

You do not need to manually manage their internal communication. Agents use AGENT_HANDOFF.md, AGENT_EVENTS.md, AGENT_MEMORY.md and WORKLOG.md as shared memory.

## 23. New plan after initialization
Use prompts/NEW_PLAN.md when adding a new feature or implementation plan after initialization. Recover APCP state and Git, determine whether it belongs in the current or a new phase, define acceptance/verification, update authorization, and create the next authorized action. Do not implement until the changed scope is authorized.

## 24. Requirement or scope change
Use prompts/CHANGE_REQUIREMENTS.md when requirements change. Recover state and Git, classify the change, analyze impact on completed/current/future work, architecture, acceptance, verification and authorization, preserve history, update/supersede affected records, and use Superpowers brainstorming/specification/writing-plans when required.

## 25. Change an existing implementation
Use prompts/MODIFY_IMPLEMENTATION.md when existing behavior must change. Compare against the current active requirement, not only the original requirement. Preserve history, recalculate acceptance/verification, use the appropriate Superpowers workflow, and implement only authorized changes.

## 26. Coordinate the three agents
Use prompts/AGENT_ORCHESTRATION.md to coordinate Forge, Sentinel and Shipwright. Require explicit handoffs, shared-memory reads, event/lesson logging and intact authorization boundaries.

## 27. Agent learning / rule improvement
Review agent lessons for reusable APCP improvements. Do not silently edit governing rules. Record evidence-backed RULE-PROP entries and identify affected rule/prompt/template/schema. Promote only through explicit governance approval.
