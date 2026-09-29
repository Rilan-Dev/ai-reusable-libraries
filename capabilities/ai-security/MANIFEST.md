# Capability: AI Security Scanner

This capability preserves Doable's project-security scanning implementation so an AI coding agent can reuse it when building an AI/project-generation platform.

## Immutable source

- `doable-source/services/api/src/security/scanner.ts`
- `doable-source/services/api/src/security/scanner-patterns.ts`
- `doable-source/services/api/src/routes/security.ts`

The existing database implementation required by the route is already present in the dependency closure:

- `dependency-closure/packages/db/src/queries/security.ts`
- `dependency-closure/packages/db/src/types.ts`
- corresponding security migrations under `dependency-closure/packages/db/`

## What the scanner provides

- Dependency vulnerability scanning through `npm audit` with a fallback check.
- Secret/API-key/private-key/database/JWT/credential detection.
- Code-quality/security anti-pattern detection.
- Severity classification.
- File/line/snippet/fix metadata.
- Persisted scan + finding lifecycle through the existing DB query layer.
- Authenticated project security endpoints for triggering scans, reading findings and dismissing findings.

## Reuse pattern

Recommended integration:

`AI/project changes → security scan → findings → review/remediation → rescan`

For AI coding agents, run the scanner after generated changes and before deployment or publication when the host's security policy requires it.

## Host boundaries

The source assumes:

- Node.js filesystem/process access.
- `npm` available for dependency audits.
- A target-project path resolver.
- PostgreSQL/DB access for persisted scans and findings.
- Host authentication/authorization for the API route.

A target project should adapt these boundaries rather than modifying the immutable source copy.

## Important limitations

This is a lightweight static/security scanner, not a replacement for a dedicated SAST, secret-management platform, dependency service or container scanner. Preserve the implementation as a reusable baseline and add host-specific scanners where required.

## Agent instruction

Do not copy only the scanner file. Inspect the full capability manifest, route, DB query closure and host-boundary requirements before implementing the feature. Keep credentials and secrets outside the reusable source bundle.
