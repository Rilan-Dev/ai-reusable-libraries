# Clara Core

Clara Core is the reusable library extracted from the Clara AI Platform itself.

## Source of truth

The source of truth for this library is Clara-AI-Platform. Doable is reference material only; it is not an extraction source for this library.

## Goal

Package Clara's reusable platform capabilities so independent SaaS applications, agent products and multi-tenant applications can consume the same Clara core without copying the entire Clara product.

## Reusable capability boundary

The core will progressively contain Clara-owned:

- AI provider/model resolution and governance
- agent runtime and configuration
- Clara-owned RAG and grounding
- knowledge-base runtime contracts
- agent drafts, branches, versions and deployments
- chat/runtime orchestration
- tools and MCP integration infrastructure
- realtime voice and provider-neutral voice contracts
- usage, quotas, entitlements, audit and observability
- events, queues and background execution contracts
- public/embed runtime
- files and attachments where they are platform capabilities

Host applications may adapt identity, tenancy, storage, secrets, billing, branding, UI theme and deployment through explicit adapters.

## Immutable extraction rule

Files under `clara-core/source/` are copied from Clara-AI-Platform byte-for-byte. They are not refactored, renamed, reformatted or modified to fit a host application.

Every extracted file is registered in `extraction-manifest.json` with its Clara Git blob SHA.

## Current status

This library is being built incrementally from the existing Clara implementation. The current slice establishes the Clara runtime, AI resolution, RAG grounding, agent version model, voice contracts and agent AI runtime selection.


## AI-agent reference documentation

For another AI coding agent, start with:
- AGENTS.md — navigation, extraction and provider/runtime rules.
- REFERENCE-MAP.md — capability-to-source dependency map.
- IMPLEMENTATION-PLAYBOOK.md — implementation sequence and verification gates.
- WORKLOG.md — extraction decisions and excluded host boundaries.
- extraction-manifest.json — immutable source/blob identity.
- scripts/verify-extraction.mjs — machine verifier.

The reference set is specifically intended to make AI provider configuration, chat, RAG, realtime voice, published agents, provider sessions, browser/relay transport, latency and usage discoverable before new code is written.

The current manifest contains 108 immutable entries.
