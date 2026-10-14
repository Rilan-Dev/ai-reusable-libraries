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


## Reuse across multiple source libraries

This package is the canonical global extraction framework for every source in this repository and future sources. Do not fork generic prompts, agent roles, schemas, verification rules or update-capture procedures into a product-specific source folder. Source folders should contain only source-specific pins, inventories, capability evidence, licensing/provenance records, verification outputs and workstream state.

For the repository-wide operating model, catalog and cross-source next action, see [SOURCE_LIBRARY_OPERATING_MODEL.md](../SOURCE_LIBRARY_OPERATING_MODEL.md), [SOURCE_LIBRARY_CATALOG.md](../SOURCE_LIBRARY_CATALOG.md), and [project-control/source-library/](../project-control/source-library/).

When an upstream branch advances, follow [Prompt 11 — Generic upstream update review](prompts/11-upstream-update-review.md) and [the update-capture workflow](workflows/upstream-update-capture.md). Detection is not authorization to copy or promote a snapshot.
