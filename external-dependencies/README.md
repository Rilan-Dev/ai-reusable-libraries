# External Dependency Boundary

The copied AI core contains the Doable implementation, but some capabilities intentionally depend on host infrastructure or separately installed packages.

Run:

```bash
node ai-platform-core/external-dependencies/generate-external-dependencies.mjs
```

This reads the captured `services/api/package.json` and produces `external-dependencies.json`.

## Dependency classes

### Portable source

- Doable AI runtime source
- provider abstractions/catalogs
- agent/tool/MCP/integration orchestration
- skills/context/chat code
- shared types
- UI reference source

### Workspace packages

The API source references workspace packages such as:

- `@doable/ai`
- `@doable/db`
- `@doable/shared`
- `@doable/marketplace-bundle`
- `docore`
- `dovault`

Their source is captured in the extraction/dependency closure.

### External npm dependencies

The exact captured API package manifest is preserved at:

`external-dependencies/source-manifests/services-api.package.json`

Codex should read this manifest instead of guessing dependencies.

### External integration packages

Doable's Activepieces registry references many separately published `@activepieces/piece-*` packages. The runtime and registry are captured, but those third-party packages are intentionally not copied into the Doable source snapshot.

The generated dependency report enumerates them.

### Infrastructure

Depending on the selected feature, the target may need:

- Node.js
- pnpm/workspace tooling
- PostgreSQL
- Git
- browser/Chromium for browser/document paths
- OS sandbox primitives
- secret storage/encryption
- tenant identity/RBAC
- network/egress policy
- Copilot CLI/SDK
- selected MCP server packages

## Copy/reuse rule

Codex must distinguish:

**"source is present"** from **"host dependency is installed/configured."**

The former is satisfied by this extraction. The latter must be explicitly completed in the target project.

## Machine-checkable inventory verification

The extraction verifier also runs:

`node ai-platform-core/external-dependencies/verify-external-dependencies.mjs`

That verifier recomputes the dependency buckets from every captured package manifest and fails if the checked-in inventory is stale or incomplete. It does not rewrite the inventory.

