# Global Source Library Operating Model

## Purpose

Operate a growing collection of reusable source libraries—Doable Source, Clara Core, MailFlow and future sources—through one shared extraction architecture. Product names identify source datasets, not different extraction methods.

## Canonical shared layer

- `source-extraction-agent/`: global prompts, agent instructions, extraction rules, schemas, templates, workflows, and verification tools.
- `project-control/`: shared agent control, role boundaries, reusable memory patterns, planning, handoffs and evidence discipline.
- `project-control/source-library/`: this repository's cross-source plan, catalog, worklog, issues, decisions, risks and immediate next action.

Do not duplicate generic prompts into source-specific folders as divergent designs. If a generic prompt needs improvement, improve the canonical prompt once and record its impact. A source-specific document holds source facts, a source pin, a path inventory, source-specific licensing notes, verification results or links to the canonical workflow.

## Source workstream contract

Each source's designated workspace records, as applicable:
1. upstream repository URL, ref, commit, root tree, retrieval date and license evidence;
2. complete recursive path/mode/blob inventory;
3. capability candidates and source/test/caller relationships;
4. per-path disposition and provenance;
5. dependency closure across code, runtime, data, UI, native/platform requirements, external packages and tests;
6. unresolved issues, evidence and independent reconciliation;
7. immutable snapshot version and manifest after authorization;
8. actual verifier command/output and snapshot status;
9. upstream change history and proposed update range;
10. source-specific memory, sessions, continuity, decisions and next action.

The workspace may live inside this repository or in the source-owning repository. MailFlow's working records are in [`Rilan-Dev/mailflow/extraction/`](https://github.com/Rilan-Dev/mailflow/tree/main/extraction/); its local framework copy is pinned at `source-extraction-agent/UPSTREAM_PIN.json`. The canonical framework and cross-source catalog remain here.

Each source keeps its own evidence and lifecycle. Cross-source governance does not combine pins, statuses, permissions or PASS gates.

## Lifecycle

Recover → pin → architecture audit → capability discovery → behavior/UI tracing → dependency closure → licensing/provenance → independent reconciliation → gate review → explicitly authorized exact copy → machine verification → publish snapshot → watch upstream → review each update.

The exact-copy stage stays blocked while required closure or licensing evidence is unresolved. No automated watcher is authorized to copy, re-pin, overwrite a snapshot, merge a PR or declare PASS.

## Update capture

1. A global watcher compares configured upstream refs against each source's recorded baseline.
2. On change, it opens or updates a tracking issue with baseline/latest commit and tree, compare URL and the affected source workstream.
3. An AI follows `source-extraction-agent/prompts/11-upstream-update-review.md` and `source-extraction-agent/workflows/upstream-update-capture.md`.
4. The review traces changed files and downstream callers, then rechecks dependency closure, license/provenance and tests.
5. The result is an update proposal and evidence. A reviewed PR is required; the previous snapshot and pin remain immutable until the new snapshot is verified and explicitly promoted.

The current watcher reads local pin files from this repository. MailFlow monitoring therefore remains disabled until the watcher can safely fetch and validate its pin from the external workspace.

## Agent boundaries

- Investigator: discovers and documents; does not declare PASS.
- Implementer: performs only authorized changes; preserves immutable source.
- Independent verifier/reconciler: challenges closure and recomputes evidence.
- Controller/owner: alone approves gate status and source-pin promotion.
- CI/deployment role: owns automation infrastructure, not source extraction decisions.

If one AI fills several roles, it must keep separate evidence passes and disclose that independence is limited.

## Fresh-session invariant

A fresh AI must recover the active source, branch, pinned baseline, source status, open blockers, verification state and next action from the central catalog plus the selected source's designated workspace. Git objects and actual machine evidence outrank chat summaries.
