# Capability: Agents

Inspect recursively:

- `doable-source/services/api/src/ai/`
- especially engine, modes, provider bridges, tool loading and chat orchestration.

Required adjacent systems:

- `doable-source/services/api/src/context/`
- `doable-source/services/api/src/mcp/`
- `doable-source/services/api/src/integrations/`

UI:

- `ui-reference/apps/web/src/modules/editor/chat/`
- `ui-reference/apps/web/src/modules/skills/`

Implement agent lifecycle, model resolution, context assembly, tool/MCP/integration registration, streaming, tool results, retries and user-input blocking/resume. Preserve the distinction between assistant output and tool execution events.
