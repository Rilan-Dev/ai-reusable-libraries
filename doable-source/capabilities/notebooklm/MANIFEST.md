# NotebookLM MCP Capability

## Purpose
Reusable AI knowledge-research capability based on Doable's standalone NotebookLM MCP server.

## Immutable source
`doable-source/mcp-servers/notebooklm/server/`

Preserved from Doable source commit `a6036d1fd6dca83c08ee5affa141e5c85e45f5af`.

## Capability
- MCP stdio, SSE and Streamable HTTP transports.
- NotebookLM summary generation.
- Notebook/source listing.
- Question answering against active notebooks.
- Infographic generation with asynchronous jobs, deduplication and persisted image artifacts.
- MCP Apps resource/UI for infographic results.
- Per-user Google cookie/session management.
- Browser/Playwright transport fallback and pooled Chromium contexts.
- Reauthentication and structured human-input requests.
- Notebook disambiguation when the same source exists in multiple notebooks.
- User/session active-notebook state.
- Google NotebookLM automation through the preserved client implementation.

## Host boundaries
- Google account authentication/session ownership.
- Cookie/credential storage.
- Public URL/tunnel.
- Persistent user-data storage.
- Browser/Chromium runtime.
- MCP host registration.
- Any Chrome extension that supplies synchronized cookies.
- Product UI/theme.

## Important
This source is a standalone optional capability, not a replacement for the core MCP runtime. A host project can expose it as an MCP connector/tool package or omit it entirely.
