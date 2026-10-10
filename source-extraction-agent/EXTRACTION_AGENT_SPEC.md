# Source Extraction Agent — Operating Specification

## Mission
Create a dependable reusable library of production-grade first-party capabilities harvested from upstream repositories. The system discovers behavior and dependencies, documents the capability, preserves original source, and proves what was captured. It is not a source rewriter and does not automatically port product code into a host application.

## Inputs
- upstream repository URL and optional owner-provided local checkout
- requested use cases and breadth (whole application platform or named capabilities)
- branch/tag/commit preference
- target package root
- licensing and redistribution constraints
- available tools, credentials, and verification environment

Missing optional inputs can be recorded as assumptions; repository and source identity cannot be guessed.

## Capability evidence model
Each candidate should record:
- stable ID, name, purpose, tier and disposition
- source commit/tree and exact paths
- public entry points, route/command/event/CLI/SDK interfaces
- caller-to-implementation execution path
- core algorithms and business invariants
- validation, authorization, state transitions, idempotency, retry and recovery behavior
- database tables, migrations, indexes, constraints, transactions and seeds
- filesystem roots, assets, subprocesses, native/runtime requirements
- environment variables, secret types, network calls, external services and packages
- tests and fixtures, with gaps explicitly stated
- UI routes/components and every meaningful interaction state
- first-party dependency closure and dynamic/runtime loading evidence
- host boundaries and adapter requirements
- source hash/tree evidence and verification status

## Classification
A. Reusable core: full first-party implementation to copy unchanged.
B. Dependency closure: first-party code/data required to compile or run a selected capability; copy unchanged.
C. Host boundary: isolate via contract/adapter; keep upstream implementation in audit snapshot unless the package's explicit scope excludes it.
D. Product-only: upstream product behavior not intended for reuse; retain classification and provenance. Do not silently omit it from the audit.

Tier 1 = broadly foundational. Tier 2 = useful optional platform module. Tier 3 = host/product-specific. Tier is independent from disposition.

## Lifecycle
0. Recover session and inspect existing control docs.
1. Establish repository access, branch/ref, license, commit and tree.
2. Map architecture and entry points.
3. Build broad capability inventory, including non-AI enablers.
4. Trace business logic and UI interactions.
5. Resolve static, dynamic, data, runtime, filesystem, package and test closure.
6. Conduct independent second-pass search and reconcile every candidate.
7. Gate scope and closure with explicit evidence.
8. Copy complete first-party trees into immutable roots.
9. Generate blob/tree manifests, dependency inventory, closure and reconciliation artifacts.
10. Run verifier on a real checkout; report exact result.
11. Publish usage guide and host-neutral contracts outside immutable roots.
12. Update project-control and hand off.

## PASS semantics
Discovery PASS means coverage and unresolved candidates are explicitly reconciled. Extraction PASS means the verifier has actually checked source identity, blobs, trees, modes, symlinks, expected roots, extra/missing files, manifests, capability paths, and dependency inventory. These are separate gates. No PASS may be inferred from planning, prior branch state, or incomplete CI visibility.
