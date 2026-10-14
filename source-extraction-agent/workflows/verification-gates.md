# Verification gates

## G0 — Source identity
PASS requires upstream URL, exact commit, root tree, license evidence and accessible source objects.

## G1 — Discovery coverage
PASS requires architecture map, entry points, capability inventory, business logic and UI mapping; unknown areas remain explicit.

## G2 — Dependency closure
PASS requires recursive first-party closure across imports, dynamic/runtime loading, database, filesystem, subprocess/native tools, packages, environment, tests and UI. Unresolved edges block claims of completeness.

## G3 — Second-pass reconciliation
PASS requires independent scan and explicit disposition for every candidate.

## G4 — Copy integrity
PASS requires real machine verification of blobs, trees, modes, symlinks, no missing/extra files and pinned source identity.

## G5 — Package readiness
PASS requires manifests, dependency inventory, host contracts/adapters separated from immutable source, copy instructions, provenance/license notices, and documented gaps.

Independent work may continue while asynchronous CI runs. An asynchronous job is not a substitute for local integrity evidence and cannot be represented as passed without a result.
