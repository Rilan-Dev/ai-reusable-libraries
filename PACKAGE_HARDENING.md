# Package Hardening Contract

This package is the copy boundary between the reusable AI platform core and a target application.

## What is guaranteed

- The immutable Doable implementation is pinned to a6036d1fd6dca83c08ee5affa141e5c85e45f5af.
- Captured immutable files and captured directory trees are independently pinned.
- Feature manifests point Codex to complete source/dependency/UI boundaries rather than isolated snippets.
- External package and infrastructure requirements are enumerated.
- The verifier detects missing, extra, or modified files inside the captured immutable roots.
- The copied package contains host-neutral contracts and adapter boundaries outside the immutable source.

## What is deliberately not guaranteed

Extraction integrity does not mean the core is already executable inside an arbitrary host. A target project must bind its own authentication, tenant identity and authorization; database schema and persistence; provider credentials and secret storage; project filesystem and execution root; sandbox/process/network policy; MCP credentials, network and process policy; integration OAuth/manual credentials and selected Activepieces pieces; RAG/vector store; streaming/transport; and object storage where required.

Runtime builds, dependency installation, provider connectivity, database migrations and end-to-end integration tests must be performed in the target project after copying.

## Hardening sequence

1. Copy the entire ai-platform-core/ directory.
2. Run the extraction verifier.
3. Read the requested capability manifest.
4. Follow every referenced source root recursively and its dependency closure.
5. Bind the target's host-specific contracts.
6. Implement runtime/API/persistence/security/UI adapters outside immutable roots.
7. Run target runtime/build/integration tests.
8. Do not modify immutable source to make a target build pass; fix the adapter boundary instead.

## Immutable boundary

Never edit, reformat, rename, optimize, refactor or "fix" files under:

- doable-source/
- dependency-closure/
- captured ui-reference/ source

The verifier is the machine-checkable gate for this boundary.
