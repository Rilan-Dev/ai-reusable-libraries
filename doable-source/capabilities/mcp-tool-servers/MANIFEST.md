# Standalone MCP Tool Servers

## Purpose
Reusable Doable implementations of concrete AI capabilities exposed as MCP servers. These are optional extensions to the generic MCP runtime.

## Immutable source
- `doable-source/mcp-servers/_shared/`
- `doable-source/mcp-servers/image-generator/`
- `doable-source/mcp-servers/markdown-builder/`
- `doable-source/mcp-servers/notebooklm/`
- `doable-source/mcp-servers/pdf-builder/`
- `doable-source/mcp-servers/presentation-builder/`
- `doable-source/mcp-servers/spreadsheet-builder/`

## Capabilities
- Shared MCP UI helpers.
- Image generation.
- Markdown/document generation.
- NotebookLM research, source/question workflows and infographic generation.
- PDF generation.
- PowerPoint/presentation generation.
- Spreadsheet generation.

The source trees include their package manifests, README/skill assets, workers and supporting implementation. Do not copy only the entrypoint and assume the rest is optional.

## Reuse model
Register each server as an MCP tool provider/connector in the host. Preserve its tool schemas and output behavior. Host-specific authentication, filesystem/object storage, process execution, provider API keys, public URLs and deployment are adapters.

## Security
Treat external credentials and generated artifacts as host-owned. Preserve permission review, sandboxing and explicit user-input/re-auth behavior where present.
