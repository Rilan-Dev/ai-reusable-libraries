# Capability: MCP

Inspect recursively:

- `doable-source/services/api/src/mcp/`
- `doable-source/services/api/src/routes/mcp-apps-data.ts`

Implement server registration, transports, connector lifecycle, discovery, tool normalization, tool invocation, credentials/auth, MCP Apps/UI resources and user-input handling.

Built-in MCP server definitions are separate infrastructure dependencies. Do not assume they are portable just because the MCP bridge is portable.

UI reference:

- MCP settings/panel/add-server surfaces under `ui-reference/apps/web/src/modules/settings/`
