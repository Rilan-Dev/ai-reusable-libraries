# Marketplace / AI Package Distribution Capability

## Purpose
Reusable Doable source for packaging and distributing AI-enabling assets across projects. This is separate from the runtime AI engine: it provides a portable bundle contract for skills, rules, instructions, knowledge, and MCP connector declarations, plus permission previews and moderation signals.

## Immutable source
- `doable-source/packages/marketplace-bundle/`
- Source commit: `a6036d1fd6dca83c08ee5affa141e5c85e45f5af`
- Root tree: `8b89b1727b6a710bec1796bc1d4b9c52522d6638`

## Included behavior
- Canonical Zod-validated bundle manifest.
- Skills, rules, instructions, knowledge and connector declarations.
- Public-only connector configuration; credentials remain an install-time concern.
- Human-readable permission classification for network/filesystem/shell/third-party/credential requirements.
- Moderation signal for bundles containing non-first-party connectors.
- Doable JSON v1 encoding/decoding.
- Standards ZIP v1 encoding/decoding with:
  - Anthropic Agent Skills `SKILL.md`
  - Cursor `.mdc` rules
  - MCP `mcp.json`
  - Claude Code `plugin.json`
- Browser/edge-safe pure codec functions.

## Reuse rule
Copy the complete package, not individual helpers. Treat it as source implementation. Host projects may adapt storage, publishing, authentication, marketplace APIs and UI, but should preserve the bundle schema and permission-review interaction semantics unless there is a deliberate compatibility migration.

## Host boundaries
- Marketplace database/storage.
- Publisher identity and tenant ownership.
- Credential provisioning.
- Listing/review/moderation workflow.
- Install/uninstall lifecycle.
- Marketplace UI/theme.
- Object storage/CDN.
