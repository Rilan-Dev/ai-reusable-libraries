# AI Project Control Protocol (APCP)

Reusable governance for AI-assisted software development.

## Core principle
The repository is durable project memory; conversation memory is supplementary. Durable memory is not automatically truth: current truth is reconciled from authority plus evidence.

## Non-negotiable rules
- Never invent missing project state.
- Never treat chat memory as stronger than repository evidence.
- Never treat a plan as authorization to implement everything in it.
- Never expand scope silently.
- Never claim verification that was not actually performed.
- Never equate implemented, verified, and phase-closed.
- Never erase historical failures or decisions; append corrections/superseding decisions.
- Never wait unnecessarily for asynchronous CI/CD when independent authorized work can continue.
- Never use pending CI/CD as evidence of success.
- Never close a phase without explicit closure authority.

## Authority hierarchy
Unless a project explicitly defines a stricter hierarchy:
1. Current human instruction.
2. Repository-local governing instructions.
3. Current Git state and committed source.
4. Active project-control authorization/state and decisions.
5. Approved specification and implementation plan.
6. Test/build/CI/deployment evidence.
7. Prior chat summaries and model memory.

Authority and evidence are separate: a specification can define what should happen without proving that it happened.

## Lifecycle
PLANNED → AUTHORIZED → IN_PROGRESS → IMPLEMENTED → VERIFICATION_PENDING → VERIFIED → CLOSED.
Exceptional states: BLOCKED, CORRECTION_REQUIRED, PASS_WITH_FOLLOWUP, SUPERSEDED.

## Required control files
PROJECT_STATE.md, CURRENT_PHASE.md, AUTHORIZATION.md, NEXT_ACTION.md, CHAT_CONTINUITY.md, WORKLOG.md, DECISIONS.md, ISSUES.md, RISKS.md, VERIFICATION_STATE.md, IMPLEMENTATION_PLAN.md, PHASES.md. ZAI_HANDOFF.md is required when a delegated implementation worker is used.

## Roles
Owner/Architect defines intent, boundaries, authorization and closure. Implementer performs authorized changes. Reviewer challenges correctness, architecture, security and regressions. Verifier evaluates evidence. One AI may perform multiple roles but must identify the role it is performing.

## Superpowers
APCP governs project state and authority. Superpowers governs execution method: brainstorming, specification, planning, TDD/implementation, review and verification.

## Continuity
A fresh AI reads repository instructions, CHAT_CONTINUITY, NEXT_ACTION, CURRENT_PHASE, AUTHORIZATION, PROJECT_STATE, the plan, relevant decisions/issues/risks/verification records, then recent Git history. It reconciles these with Git before changing code.

## Async rule
Record asynchronous CI/CD as pending evidence. Continue only with independent work. Revisit pending evidence before making a decision that depends on it. Never claim a pending job passed.

## Self-critique
At every phase boundary ask: what requirement may still be unmet, what assumption is unproven, what evidence is stale, what changed outside scope, what security/tenancy/reliability/rollback case is missing, what would a fresh reviewer challenge, and can a new chat continue from the repository alone?

## Reuse
Copy project-control into a new repository. Start with prompts/INITIALIZE_PROJECT.md. Later conversations use prompts/CONTINUE_PROJECT.md.

## Practical usage

You do not need to memorize APCP. Use the practical [USAGE_GUIDE.md](./USAGE_GUIDE.md) for copy-paste action prompts.

Common commands are:
- **New project:** use [prompts/NEW_PROJECT_BOOTSTRAP.md](./prompts/NEW_PROJECT_BOOTSTRAP.md), then add the product requirements.
- **Continue:** read `CHAT_CONTINUITY.md` and `NEXT_ACTION.md`, reconcile with Git, then continue the next authorized action.
- **Review:** review the authorized scope, Git diff, architecture, security, reliability, and tests.
- **Verify:** map every acceptance criterion to actual evidence in `VERIFICATION_STATE.md`.
- **Close:** use `CLOSE_PHASE.md`; closure requires verification, scope reconciliation, and explicit closure authority.
- **Recover:** use `RECOVER_PROJECT.md` when project-control, Git, or prior claims contradict each other.

If you only remember one everyday command, use: **"Please proceed with the next authorized work. Read the APCP project-control state first, reconcile with Git, follow APCP + Superpowers, implement the next action, update project-control, and continue independent authorized work."**

## Multi-agent development
APCP supports a coordinated agent team with stable identities: DEV-01 / Forge for authorized product development; FIX-01 / Sentinel for error diagnosis/remediation; OPS-01 / Shipwright for CI/CD, Vercel, Docker and deployment.

The repository is the agents' communication bus. Agents share durable state through AGENT_REGISTRY.md, AGENT_HANDOFF.md, AGENT_MEMORY.md, AGENT_EVENTS.md, WORKLOG.md and the existing decision/issue/risk/verification ledgers.

Agents read relevant memory before work and record significant failures, remedies, failed approaches and reusable DO/DO NOT lessons afterward.

## Adaptive scope
APCP is not an initialization-only contract. New requirements, new plans, implementation changes and changed priorities must be reconciled against the current active requirement. A later authorized requirement can add to, modify, supersede, deprecate or reopen earlier scope. Completed work remains historical evidence, not immutable scope.

Material changes require impact analysis and, where appropriate, Superpowers brainstorming, specification and writing-plans. Affected phases, acceptance criteria and authorization must be explicitly updated or superseded before implementation.

## Rule learning
Agents may propose improvements through RULE-PROP records. They must not silently rewrite APCP governance. Rule proposals require evidence and explicit governance approval before promotion into MASTER_AI_RULE.md, schemas, prompts or templates.
