# MailFlow Workstream User Guide

Use the global extraction framework, not a MailFlow-specific agent architecture.

## Start a new AI session

Copy/paste:

```text
Work in Rilan-Dev/ai-reusable-libraries. First read README.md, SOURCE_LIBRARY_OPERATING_MODEL.md, SOURCE_LIBRARY_CATALOG.md, and project-control/source-library/SOURCE_LIBRARY_STATE.md plus SOURCE_LIBRARY_NEXT_ACTION.md.

Use source-extraction-agent/ as the canonical global source-extraction method. Then recover mailflow-source-library/project-control/CHAT_CONTINUITY.md, CURRENT_PHASE.md, NEXT_ACTION.md, VERIFICATION_STATE.md, WORKLOG.md, DECISIONS.md, ISSUES.md and RISKS.md.

Reconcile all claims with Git and actual evidence. Continue the next safe authorized MailFlow discovery/closure action. Do not copy source, advance the source pin, or claim PASS until license/provenance review, complete dependency closure, independent reconciliation, explicit authorization and actual machine verification pass. Update both the source-specific state and the central source-library next action/worklog.
```

## What belongs where

- Global extraction prompts/rules/schemas/templates/tools: `source-extraction-agent/`.
- Cross-source plan, catalog, shared decisions/risks and current program next action: `project-control/source-library/`.
- MailFlow pin, manifests, license notes, evidence, source-specific blockers and worklog: this directory.
- Immutable source: only a later authorized, versioned snapshot; none has been copied yet.

## Continue work

Use `source-extraction-agent/prompts/11-upstream-update-review.md` for any detected upstream change. For capability discovery, dependency closure, exact copy, second-pass audit and integrity verification, use the corresponding canonical prompts listed in `source-extraction-agent/README.md`.

## Current blockers

All 1,319 MailFlow paths are still unclassified. The AGPL-3.0/commercial-license/CLA and third-party asset terms need review. The initial source pin is a proposed discovery baseline, not copy authorization.
