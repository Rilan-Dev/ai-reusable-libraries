# APCP State Invariants

1. VERIFIED requires current evidence for every mandatory acceptance criterion.
2. CLOSED requires VERIFIED, review disposition, scope reconciliation and explicit closure authority.
3. IN_PROGRESS requires an ACTIVE authorization covering the task.
4. BLOCKED requires a recorded blocker and recovery path.
5. PASS_WITH_FOLLOWUP requires explicit follow-up records.
6. STALE evidence cannot satisfy a current criterion.
7. A superseded decision cannot be active authority.
8. NEXT_ACTION may only target ACTIVE authorized work.
9. Phase transition cannot be inferred solely from commits.
10. CI success proves only what that job actually exercised.
11. Pending or failed CI does not automatically block unrelated independent implementation.
12. Worklog history is append-only; corrections are appended.
13. Revoked, expired or superseded authorization cannot justify new implementation.
14. A worker claim cannot promote implementation to VERIFIED or CLOSED.