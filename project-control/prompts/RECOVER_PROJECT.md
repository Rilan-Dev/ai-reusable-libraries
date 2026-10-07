# APCP — Recover Inconsistent State

1. Identify each contradiction.
2. Apply the authority hierarchy and identify evidence.
3. Determine whether authorization, scope or completion state changes.
4. Preserve history; never silently rewrite historical records.
5. Record reconciliation in DECISIONS.
6. Correct only stale projections.
7. Invalidate affected verification evidence in VERIFICATION_STATE.
8. Set the safest NEXT_ACTION.
9. Record recovery in WORKLOG.

If authority cannot be established safely, remain BLOCKED and ask the owner.