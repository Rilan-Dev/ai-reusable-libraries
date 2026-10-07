# APCP — Change Existing Implementation Prompt

Use when an existing implementation must be edited because requirements changed, a defect was discovered, an architectural decision changed, or a previous implementation is no longer appropriate.

## Prompt

First recover APCP state and reconcile with Git. Read current authorization, phase, plan, verification, worklog, decisions, issues, risks and relevant agent memory.

Determine whether the requested modification is:
- a defect correction
- a requirement change
- an architectural replacement
- a compatibility/deprecation change
- a refactor required by the current scope
- unrelated work

Compare the requested behavior with the **current active requirement**, not merely the original requirement. Completed code is not protected from authorized change, but changing it must be explicit and traceable.

Use Superpowers systematic-debugging for defects and brainstorming/specification/writing-plans when design or scope materially changes. Recalculate acceptance and verification impact before implementation.

Preserve history. Record what is being retained, replaced, deprecated or reopened. Update authorization when necessary. Implement only the active authorized modification.
