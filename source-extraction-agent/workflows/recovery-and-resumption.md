# Recovery and resumption

1. Read latest project-control files and repository state.
2. Compare declared commit/branch with actual remote state.
3. Find last complete worklog entry and latest evidence artifacts.
4. Reconcile planned vs implemented tasks.
5. Re-run only evidence that is missing, stale, or invalidated by changed inputs.
6. Never repeat large copies or overwrite prior evidence without need.
7. If context is missing, use Git history and files as source of truth; ask the user only for inaccessible decisions or secrets.
8. Write the new checkpoint before handoff.
