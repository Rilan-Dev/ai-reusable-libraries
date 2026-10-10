# Capability: <stable-id>

## Purpose
Describe the behavior and reusable value.

## Tier and disposition
Tier: 1 / 2 / 3
Disposition: reusable core / dependency closure / UI reference / host boundary / product-only / not applicable
Evidence and rationale:

## Pinned source
Repository, ref, commit, root tree:
Exact implementation paths:
Exact dependency-closure paths:
UI/reference paths:
Public routes/APIs/events/CLI/SDK:
Key symbols and callers:

## Lifecycle and business rules
Entry -> validation/auth -> domain logic -> persistence/external side effect -> response/UI.
Invariants, calculations, state transitions, idempotency, retry, concurrency, recovery and audit:

## Data and runtime
Tables/migrations/indexes/constraints:
Filesystem/assets:
Environment/secrets:
External services/network:
Subprocess/native requirements:
External packages:

## Tests and UI
Tests/fixtures:
Coverage gaps:
Routes/components/dialogs:
Loading/empty/error/disabled/permission/destructive/success states:

## Host boundaries
Host responsibilities:
Contract/adapters required:
Forbidden shortcuts:

## Acceptance criteria
- [ ] Source paths exist at pinned revision
- [ ] First-party dependency closure resolved
- [ ] Business lifecycle traced
- [ ] UI states recorded
- [ ] Dependencies and boundaries inventoried
- [ ] Candidate reconciled in second pass
- [ ] Integrity verifier covers captured files
