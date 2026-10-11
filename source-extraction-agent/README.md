# Source Extraction Agent

A repository-native operating system for discovering, documenting, copying, and verifying reusable first-party source code from upstream applications without altering the captured source.

## Start here
1. Read [USER_GUIDE.md](USER_GUIDE.md) for how to invoke prompts, separate agent roles, and persist memory across chats.
2. Read [AGENTS.md](AGENTS.md), [EXTRACTION_RULES.md](EXTRACTION_RULES.md), and [EXTRACTION_AGENT_SPEC.md](EXTRACTION_AGENT_SPEC.md).
3. Recover the checkpoint from [project-control/CHAT_CONTINUITY.md](project-control/CHAT_CONTINUITY.md), then read CURRENT_PHASE, NEXT_ACTION, VERIFICATION_STATE, ISSUES, RISKS, DECISIONS, and WORKLOG.
4. Complete repository onboarding and pin the source commit and root tree before inventory work.
5. Follow `prompts/00-session-recovery.md` and `prompts/01-repository-onboarding.md`.
6. Do not copy source until the discovery/closure gate has evidence-backed PASS.
7. Never claim integrity PASS unless the verifier actually ran against the captured package and pinned upstream Git objects.

## Principles
- Immutable source is evidence, not a workspace for refactoring.
- Trace behavior, business rules, data, UI states, and runtime dependencies—not just filenames.
- Keep host integration separate from source capture.
- Make every candidate's disposition explicit and explain exclusions.
- Continue independent work while asynchronous CI runs, but never fabricate gate results.
- Keep append-only work history and actionable handoffs.

## Contents
- prompts/: reusable task prompts
- skills/: focused agent skill playbooks
- workflows/: lifecycle, handoffs, gates, recovery
- templates/: consistent evidence records
- schemas/: machine-readable record contracts
- project-control/: extraction-specific continuity
- examples/: repository-specific request templates

## Scope
Designed for application platforms, AI systems, SaaS services, integrations, workflow engines, media pipelines, developer tooling, and other reusable capabilities. It does not assume all upstream code is reusable or that every repository has the same architecture.
