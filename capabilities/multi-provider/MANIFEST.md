# Capability: Complete Multi-Provider AI

## Runtime source

Inspect recursively:

- `doable-source/services/api/src/ai/`
- `doable-source/packages/shared/src/ai/`
- `doable-source/packages/doable-ai/`

Required route/bridge sources:

- `doable-source/services/api/src/routes/provider-bridge.ts`
- `doable-source/services/api/src/routes/provider-catalog.ts`
- `doable-source/services/api/src/routes/auth/platform-ai-bootstrap.ts`

## Required behavior

Implement the complete provider lifecycle:

provider catalog → provider connection/credentials → validation → model discovery/catalog → provider resolver → runtime provider creation → model selection → chat/tool calling → streaming → errors/reconnect → persistence/settings UI.

Do not implement only an LLM interface.

## UI reference

Inspect:

- `ui-reference/apps/web/src/modules/ai-settings/`
- `ui-reference/apps/web/src/app/(dashboard)/ai-settings/`
- `ui-reference/apps/web/src/app/setup/steps/Step2AIProvider.tsx`

Preserve provider setup, connection state, model selection, scope/access control, validation, loading, success, error and retry interactions.

## Shared dependencies

Inspect:

- `dependency-closure/services/api/src/db/`
- `dependency-closure/services/api/src/middleware/`
- `dependency-closure/packages/db/`
- `doable-source/packages/docore/`
- `doable-source/packages/dovault/`

Host bindings required: identity/tenant, DB, secret storage, provider credentials, network policy and runtime configuration.

## Completion test

A feature is incomplete if the target can select a provider but cannot persist credentials, validate it, resolve a model at runtime, stream a chat turn, or recover from provider failure.
