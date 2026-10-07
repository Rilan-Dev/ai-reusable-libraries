# Verification State

Evidence ledger. Never fill a result from expectation.

PASS — observed evidence satisfies criterion.
FAIL — observed evidence does not satisfy criterion.
BLOCKED — evidence could not execute due to dependency.
NOT_RUN — intentionally not executed.
STALE — old evidence no longer proves current state.

### V-<id> — <criterion>
**Status:** <status>
**Command/observation:** <exact command or external observation>
**Scope:** <commit/files/environment>
**Observed at:** <timestamp>
**Result:** <actual result>
**Relevant output:** <short evidence>
**Freshness:** <fresh|stale>
**Invalidated by:** <change or none>