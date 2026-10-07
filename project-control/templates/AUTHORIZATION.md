# Authorization Ledger

Authorization is explicit, scoped and revocable. A plan, issue, suggestion, previous chat message or worker claim does not grant implementation authority by itself.

Append authorization events; do not rewrite history.

### A-<id> — <grant or change>
**Date:** <date>
**Status:** <ACTIVE|REVOKED|EXPIRED|SUPERSEDED>
**Granted by:** <owner/role/reference>
**Actor:** <implementer/agent role>
**Phase:** <phase>
**Scope:** <exact files/features/actions allowed>
**Non-scope:** <explicit exclusions>
**Acceptance:** <required result>
**Verification:** <required evidence>
**Expires/revoked by:** <reference or none>
**Supersedes:** <authorization ID or none>

## Rule
Only ACTIVE authorization may be used to justify implementation. If authorization cannot be mapped to the current task, treat the task as unauthorized.