# AI Document & Presentation Builders Capability

## Purpose
Reusable Doable MCP Apps for AI-generated business artifacts.

## Immutable source
- `doable-source/mcp-servers/pdf-builder/`
- `doable-source/mcp-servers/presentation-builder/`
- `doable-source/mcp-servers/spreadsheet-builder/`
- `doable-source/mcp-servers/markdown-builder/`
- `doable-source/mcp-servers/_shared/ui.mjs`
- Source commit: `a6036d1fd6dca83c08ee5affa141e5c85e45f5af`

## Included capabilities
- PDF: print-ready HTML → PDF + HTML with live MCP App preview.
- Presentation: web slides and PPTX generation, including reusable presentation specification/engine.
- Spreadsheet: XLSX and CSV generation with live MCP App preview.
- Markdown: structured Markdown and rendered HTML with live MCP App preview.
- Shared MCP App UI helpers and theme-adaptive preview/download cards.
- PDF, spreadsheet and Markdown authoring skills that guide the AI's generation behavior.

## Host boundaries
- MCP server registration/launch policy.
- Output storage/project filesystem.
- Browser/Chromium runtime for PDF rendering.
- Artifact download/attachment policy.
- Host theme and MCP App embedding.
- Optional sandboxing for generated documents.

## Reuse rule
Copy the complete listed source trees. Do not copy only the entrypoint: the shared UI module, presentation engine, and authoring skills are part of the behavior.
