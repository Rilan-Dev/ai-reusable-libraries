# Capability: AI Chat

Inspect recursively:

- `doable-source/services/api/src/routes/chat/`
- `doable-source/services/api/src/ai/`
- `doable-source/packages/doable-ai/`
- `doable-source/packages/doable-sdk/`

Required behavior:

session lifecycle → context → provider resolution → streaming → tool calls → MCP/integration calls → user-input pauses → recovery → persistence.

UI:

- `ui-reference/apps/web/src/modules/editor/chat/`
- `ui-reference/apps/web/src/app/(dashboard)/dashboard/dashboard-chat-input.tsx`

Do not reduce this to a text-generation endpoint.
