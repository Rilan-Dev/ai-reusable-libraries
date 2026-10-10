# Prompt 07 — Exact source extraction (authorized gate only)

Proceed only when source commit/tree is pinned and discovery/closure gate has explicit PASS evidence.

- Copy complete authorized first-party trees byte-for-byte from the pinned source.
- Prefer git object-based copy and preserve blob SHA, tree SHA, mode, symlink and executable metadata.
- Separate immutable source, dependency closure, UI reference, new contracts/adapters, manifests and external dependency inventory.
- Never run formatters, codemods, linters that modify files, or refactors over immutable roots.
- Do not cherry-pick fragments while claiming complete capability closure.
- Do not vendor external dependencies unless first-party source.
- Preserve license and attribution files and document excluded files with reasons.
- Generate manifests directly from source Git objects, not from hand-written claims.
- Stop and report if any file's provenance or byte identity cannot be proven.
