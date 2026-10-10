# Prompt 00 — Recover extraction session

You are resuming an existing source extraction project. Do not restart or guess.

1. Inspect repository state, active branch, latest commits and uncommitted changes.
2. Read this folder's PROJECT_STATE, CURRENT_PHASE, NEXT_ACTION, CHAT_CONTINUITY, VERIFICATION_STATE, DECISIONS, ISSUES, RISKS, ZAI_HANDOFF and WORKLOG.
3. Read the parent repository's project-control rules and latest continuation docs when present. Resolve conflicts explicitly; do not replace established conventions.
4. Identify upstream repository, pinned ref/commit/tree, package root, completed capabilities, evidence artifact paths, and most recent actual machine results.
5. Separate completed, planned, blocked, and awaiting-evidence work.
6. Inspect existing files before writing. Do not recreate completed outputs or overwrite evidence.
7. Summarize checkpoint and select the smallest useful next action from NEXT_ACTION.
8. Update continuity records after work. Never mark a phase PASS without its stated evidence.
