# MailFlow Upstream Change Capture and Update Playbook

## Goal

Keep the library aligned with Rilan-Dev/mailflow without silently changing the baseline, losing completed work or copying only obvious files from a feature.

## Automated detection

The workflow at .github/workflows/mailflow-source-watch.yml runs every six hours and by manual dispatch. It reads the recorded baseline, queries upstream main and opens a tracking issue if a newer commit exists. It does not change the pin or copy source. Polling requires no write access to the upstream MailFlow repository.

An optional faster path is a source-side GitHub workflow that dispatches an event into this repository using a narrowly scoped token. This is optional; the scheduled watcher is the baseline.

## AI-assisted update cycle

1. Freeze identity: record old and new commit/tree pins.
2. Diff: list changed, added, removed and renamed paths, old/new blob IDs, modes and commit messages.
3. Interpret: inspect patches and commits; map changes to capabilities, tests, migrations, configuration, packaging and platform targets.
4. Trace impact: find callers, shared contracts, data schemas, permissions, secrets, runtime and tests; expand beyond directly changed paths until dependency closure is complete.
5. Classify paths and review license/provenance, especially new dependencies and assets.
6. Produce a proposal with capability impacts, source paths, missing edges, test evidence and risks.
7. Never overwrite the previous snapshot. Create a new snapshot revision keyed by the new source pin.
8. Recompute source blob identities and tree equality; verify paths and modes and ensure there are no unapproved modifications.
9. Have an independent agent reconcile manifest completeness and unresolved edges.
10. Advance current.json only in a reviewed PR after all gates pass. Close the tracking issue only after the PR is merged and the recorded baseline is recorded.

## Never do these

- Do not advance current.json just because main moved.
- Do not assume directly changed files are the whole impact.
- Do not delete prior snapshots or evidence.
- Do not normalize line endings, rename paths or run formatters in immutable copies.
- Do not blindly copy generated output, secrets, local config, binaries, dependencies or licensed assets.
- Do not treat AI summaries as a substitute for Git object hashes, raw diffs, tests or explicit approval.

## Required update deliverables

Old/new pins; full changed-path manifest; compare URL; capability impact matrix; dependency closure and license/provenance delta; copy and verification results; commands, exit codes and CI links; unresolved risks; append-only worklog; updated next action and continuity.
