# Doable AI Platform Extraction — Root Cause Analysis

## Current state

The source extraction is broad enough to cover the requested reusable AI-platform domains: multi-provider AI, agent/plan/chat modes, tools, MCP, integrations, skills/rules, context/memory, attachments/image persistence, planning/clarification, realtime/Yjs collaboration, visual editing, project/runtime/build generation, framework-aware prompting/templates, GitHub/version control, tracing/audit/analytics, usage/credits/billing/plans, notifications/email, marketplace, deployment/custom domains, NotebookLM, and document/media MCP servers.

The remaining problems are primarily **verification and portability problems**, not missing Doable source trees.

## Root issues

### 1. Provenance drift

The extraction gained second-pass extensions, but the verifier/report metadata still described older file/tree/capability counts. One presentation-builder tree fingerprint was also stale.

### 2. Verifier false negatives

The verifier assumed every manifest file record had a `path`, even though the three latest provenance entries used `destinationPath`. It also treated the partial per-file provenance list as a complete root inventory. Captured tree SHAs are the authoritative completeness proof for captured scopes.

### 3. Capability-list drift

The extraction capability closure contains more capabilities than the original verifier checked. The fixed verifier now covers the complete current set.

### 4. Source-complete is not host-portable

Runtime code still reaches directly into Doable SQL, secrets, project paths, session tables and platform configuration. The contracts package provides the correct abstraction direction, but runtime rewiring to those contracts is still pending.

### 5. Multi-provider is compatibility-based

The catalog covers many providers, but the primary runtime wire/config shapes are OpenAI-compatible, Azure and Anthropic. Gemini and other provider quirks are handled through compatibility/proxy logic. This should be treated as a compatibility-provider architecture, not as one fully native SDK per vendor.

### 6. RAG is an adapter boundary

Embeddings and context/memory exist, but the extracted core does not prescribe a universal vector database. `contracts/rag-context.ts` intentionally leaves retrieval to the host.

### 7. Chat orchestration is over-coupled

The large chat route combines provider selection, context, tools, skills, sessions, streaming, recovery, tracing, post-processing, versioning, memory and credits. This is the largest maintainability hotspot for host integration.

## Actual pending work

1. Run the fixed extraction and external-dependency verifiers locally.
2. Run package/import/build smoke tests.
3. Introduce explicit host adapters for identity, tenant context, DB, secrets, filesystem/runtime, provider registry, transport and RAG.
4. Bind a concrete vector retrieval service through `RAGAdapter`.
5. Split chat orchestration into resolution → context/RAG → tool/session → streaming → recovery → post-processing → usage.
6. Verify every copied platform extension in the target host.
7. Add voice/STT/TTS separately when required; this Doable source snapshot has no dedicated voice/STT/TTS runtime tree.

## Completion gate

Treat the extraction as **source-complete, verifier-hardened, adapter-pending** until the local verifier passes and a target-project runtime/build smoke test is green.
