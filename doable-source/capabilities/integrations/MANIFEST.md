# Capability: Complete Integrations

## Runtime source

Inspect recursively:

- `doable-source/services/api/src/integrations/`
- `doable-source/services/api/src/routes/integrations.ts`
- `doable-source/services/api/src/routes/integrations-admin.ts`
- `doable-source/services/api/src/routes/integrations-catalog.ts`
- `doable-source/services/api/src/routes/integrations-connections.ts`
- `doable-source/services/api/src/routes/integrations-oauth.ts`

Also inspect integration-related AI tool bridges under `doable-source/services/api/src/ai/`.

## Required behavior

Implement:

catalog → search/category filtering → connection creation → OAuth/manual/enhanced auth → credential vault → connection status → tool discovery → AI tool definitions → invocation → result/error → disconnect/reconnect → permission/re-authentication → UI state.

Do not copy only the catalog. The calling/runtime bridge is part of the feature.

## External dependency boundary

Doable uses external integration pieces. The captured registry/runtime tells the host how to load and invoke them; it does not silently vendor every third-party package.

Codex must inspect the integration registry's piecePackage references and produce an explicit install list for the target project.

## UI reference

Inspect recursively:

- `ui-reference/apps/web/src/modules/integrations/`
- setup integration UI under `ui-reference/apps/web/src/app/setup/`

Required states include available, connected, disconnected, expired, permission failure, OAuth success/failure, validation, loading, empty and retry.

## Host bindings

Identity/tenant, DB, secret encryption, OAuth callback URLs, HTTP/network policy and external package installation are host-specific.

## Completion test

A feature is incomplete if an integration can be displayed but cannot securely connect, expose its tools to the agent, execute those tools and recover from authentication failure.
