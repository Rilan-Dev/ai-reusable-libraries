# Global upstream update-capture workflow

1. **Detect:** Compare configured upstream refs to recorded baseline commits.
2. **Record:** Capture latest commit/tree, baseline commit/tree, compare URL and source workstream path in an issue.
3. **Recover:** Read repository-level source-library state and the source-specific checkpoint.
4. **Diff:** Enumerate all changed paths, statuses, modes and blob identities across the full range.
5. **Impact:** Map changed paths to capabilities, imports/callers, runtime/configuration, database/migrations, UI states, tests and other sources if they consume this snapshot.
6. **Re-close:** Recompute first-party dependency closure; do not assume unchanged files remain unaffected.
7. **License:** Review source license, notices, CLA, third-party assets and commercial restrictions for added/changed paths.
8. **Propose:** Produce a versioned snapshot/update plan and explicit verification checklist.
9. **Review:** Open a PR with provenance and machine evidence. Preserve the prior pin and snapshot.
10. **Promote:** Only after explicit authorization, successful exact-copy verification and independent reconciliation may the new baseline become current.

Automation may detect and report only. It must never copy upstream source, rewrite immutable snapshots, advance the source pin, merge a PR or declare extraction PASS.
