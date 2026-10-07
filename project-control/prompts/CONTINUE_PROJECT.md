# APCP — Continue Project

Recover the project from repository state, not from conversation memory.

Read in order: repository instructions; CHAT_CONTINUITY; NEXT_ACTION; CURRENT_PHASE; PROJECT_STATE; IMPLEMENTATION_PLAN; relevant DECISIONS/ISSUES/RISKS/VERIFICATION_STATE; recent Git history; files named by NEXT_ACTION.

Reconcile these records with Git. Current human instructions override stale records. Do not silently repair contradictions: record a reconciliation decision. Do not guess when authorization or scope is materially ambiguous.

Before changing code establish current phase, authorized scope, exact task, acceptance criteria, constraints, evidence state and relevant risks/issues.

Use applicable Superpowers skills. Do not reimplement already-committed work. Do not expand scope because a useful future improvement was discovered.

If CI/CD is pending, continue independent authorized work; do not treat pending work as evidence.

At session end update WORKLOG and, when changed, PROJECT_STATE, CURRENT_PHASE, NEXT_ACTION, VERIFICATION_STATE and CHAT_CONTINUITY.

Never claim completion without fresh evidence for the exact claim.