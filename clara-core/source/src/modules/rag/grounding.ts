/**
 * src/modules/rag/grounding.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * THE authenticated Clara grounding entry point (plan Task 3.1).
 *
 * One service that every provider-controlled turn calls to obtain grounded
 * context. It ultimately resolves:
 *
 *     tenantId (org)  ← KB → agent → org, resolved SERVER-SIDE
 *     kbId            ← the requested KB, validated active
 *     documentId      ← optional Qdrant filter
 *     ragMode         ← runtime RAG policy (classic/hybrid/agentic + graph)
 *     query           ← the user question
 *   and returns grounded context + sources.
 *
 * Authorization properties (plan §3.1 acceptance):
 *   • the caller cannot select another tenant — orgId is derived from the KB
 *     row server-side, never accepted from the request;
 *   • the caller cannot select another KB — the kbId must resolve to an
 *     ACTIVE knowledge base owned by that tenant;
 *   • the caller cannot bypass authorization — quota admission (atomic
 *     check-and-insert) runs BEFORE any retrieval spend;
 *   • the provider cannot create vendor KB state — this module performs zero
 *     KB/collection writes; Qdrant stays Clara-owned and read-only here.
 *
 * Provider = how Clara talks. Clara KB = what Clara knows. This service is
 * the only "what Clara knows" door for realtime voice turns.
 *
 * Transport-neutral: returns a plain outcome object (no NextResponse), so
 * HTTP routes, provider webhooks, relays and future server-side turn
 * pipelines all share the exact same grounding path.
 */

import { getAssistantConfigByKb, getKnowledgeBaseById, getKnowledgeBaseDocumentTitles } from "@/modules/knowledge-bases/core/db";
import {
  finalizeQueryEvent,
  logQueryEvent,
} from "@/modules/knowledge-bases/core/analytics-db";
import { admitQueryEvent, type AdmissionDenied, type QuotaWarning } from "@/lib/quota-admission";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
import { query as dbQuery } from "@/lib/db";
import type { ProviderConfig } from "@/modules/ai-core/types";
import { getQdrantClient } from "@/modules/admin/core/vector-store";
import { embedQueryCached } from "@/modules/rag/query-embedding-cache";
import { getCollectionEmbedding, resolveSearchEmbedding } from "@/modules/knowledge-bases/core/embedding-index";
import { scoreThresholdFor } from "@/modules/ai-core/multilingual-embeddings";
import {
  inferKnowledgeLanguage,
  needsRetrievalTranslation,
  translateQueryForRetrieval,
  type RetrievalTranslation,
} from "@/modules/rag/cross-lingual";
import { buildTurnGuidance } from "@/modules/rag/turn-guidance";
import { getKnowledgeTopics } from "@/modules/rag/knowledge-topics";
import {
  detectVisitorLanguage,
  normalizeLanguagePolicy,
  replyLanguageDirective,
  resolveReplyLanguage,
  type ReplyLanguageDecision,
} from "@/modules/assistant/core/language-policy";
import { getRagRuntimeConfig } from "@/modules/rag/config";
import { retrieveGraphContext } from "@/modules/graph/core/graph-retriever";
import { candidatePoolSize, diversifyByDocument } from "@/modules/rag/diversify";
import type { QuerySurface } from "@/modules/knowledge-bases/core/analytics-db";

const SCORE_THRESHOLD = 0.25;
const DEFAULT_TOP_K = 6;
const MAX_TOP_K = 20;
/**
 * How long a KB's resolved AI configuration is reused. Resolving it costs
 * several database round trips (~2.4 s from a cold serverless instance), paid
 * on every voice turn once the cache expired. Override with
 * GROUNDING_CONFIG_CACHE_TTL_MS; published-version changes apply after it.
 */
const GROUNDING_RESOLUTION_CACHE_TTL_MS = (() => {
  const value = Number(process.env.GROUNDING_CONFIG_CACHE_TTL_MS);
  return Number.isFinite(value) && value >= 0 ? value : 120_000;
})();
/** Max wait for a not-yet-cached KB topic summary on capability turns. */
const TOPICS_WAIT_MS = 1_500;
/**
 * Graph retrieval is optional enrichment. On a realtime voice turn it must
 * never hold the answer back: after this budget the turn continues with the
 * vector evidence alone. Override with GROUNDING_GRAPH_BUDGET_MS.
 */
const DEFAULT_GRAPH_BUDGET_MS = 1200;

type CachedEmbeddingResolution = {
  expiresAt: number;
  value: Awaited<ReturnType<typeof resolveAIConfig>>;
};

const groundingResolutionCache = new Map<string, CachedEmbeddingResolution>();

async function resolveGroundingAIConfig(kbId: string, preferDraft = false) {
  const key = `rag-embedding:${kbId}|${preferDraft ? "draft" : "live"}`;
  const cached = groundingResolutionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await resolveAIConfig({ kbId, surface: "rag-embedding", preferDraft });
  groundingResolutionCache.set(key, {
    expiresAt: Date.now() + GROUNDING_RESOLUTION_CACHE_TTL_MS,
    value,
  });

  if (groundingResolutionCache.size > 512) {
    const now = Date.now();
    for (const [cacheKey, entry] of groundingResolutionCache) {
      if (entry.expiresAt <= now) groundingResolutionCache.delete(cacheKey);
    }
  }

  return value;
}

/**
 * KB metadata used on every turn (KB row, assistant config, document titles,
 * owning tenant). Loading it costs four database round trips — and on a
 * single-connection serverless pool they run one after another — so it is
 * served stale-while-revalidate: a turn uses the cached copy immediately and,
 * when it is older than GROUNDING_METADATA_REFRESH_MS (default 15 s),
 * refreshes it in the background for the next turn. Admin edits therefore
 * apply within seconds; a copy older than GROUNDING_METADATA_MAX_AGE_MS
 * (default 10 min) is never used.
 */
type GroundingMetadata = {
  kb: Awaited<ReturnType<typeof getKnowledgeBaseById>>;
  assistantConfig: Awaited<ReturnType<typeof getAssistantConfigByKb>>;
  documentTitles: string[];
  tenant: { orgId: string | null; agentId: string | null };
};

function envMs(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const metadataCache = new Map<string, { value: GroundingMetadata; fetchedAt: number }>();
const metadataInFlight = new Map<string, Promise<GroundingMetadata>>();

function loadGroundingMetadata(kbId: string): Promise<GroundingMetadata> {
  const pending = metadataInFlight.get(kbId);
  if (pending) return pending;
  const load = Promise.all([
    getKnowledgeBaseById(kbId),
    getAssistantConfigByKb(kbId),
    getKnowledgeBaseDocumentTitles(kbId),
    resolveKbTenant(kbId),
  ])
    .then(([kb, assistantConfig, documentTitles, tenant]) => {
      const value: GroundingMetadata = { kb, assistantConfig, documentTitles, tenant };
      // Only cache a KB that exists; a missing KB is re-checked every time.
      if (kb) metadataCache.set(kbId, { value, fetchedAt: Date.now() });
      else metadataCache.delete(kbId);
      if (metadataCache.size > 512) {
        const oldest = metadataCache.keys().next().value;
        if (oldest !== undefined) metadataCache.delete(oldest);
      }
      return value;
    })
    .finally(() => metadataInFlight.delete(kbId));
  metadataInFlight.set(kbId, load);
  return load;
}

async function getGroundingMetadata(kbId: string): Promise<{ value: GroundingMetadata; cached: boolean }> {
  const entry = metadataCache.get(kbId);
  const age = entry ? Date.now() - entry.fetchedAt : Infinity;
  if (entry && age <= envMs("GROUNDING_METADATA_MAX_AGE_MS", 600_000)) {
    if (age > envMs("GROUNDING_METADATA_REFRESH_MS", 15_000)) {
      loadGroundingMetadata(kbId).catch((error: unknown) => {
        console.warn("[grounding] metadata refresh failed:", (error as Error)?.message ?? error);
      });
    }
    return { value: entry.value, cached: true };
  }
  return { value: await loadGroundingMetadata(kbId), cached: false };
}

/** Standard Server-Timing header value for grounding stage timings. */
export function groundingServerTiming(timings: GroundingTimings | undefined, prefix = ""): string | null {
  if (!timings) return null;
  return Object.entries(timings)
    .map(([stage, ms]) => `${prefix}${stage.replace(/Ms$/, "")};dur=${ms}`)
    .join(", ");
}

export type GroundingRagMode = "classic" | "hybrid" | "agentic";

export interface GroundingRequest {
  /** The Clara KB to ground against. Must be active and tenant-bound. */
  kbId: string;
  /** The user question. */
  query: string;
  /** Optional document scope INSIDE the KB (Qdrant filter). */
  documentId?: string | null;
  /** Requested RAG mode; runtime policy decides the effective mode. */
  ragMode?: GroundingRagMode | string | null;
  /** Retrieval width. */
  topK?: number;
  /** Audit/metering surface (search | voice | embed | workspace). */
  surface?: QuerySurface;
  /** Correlation with realtime voice sessions (plan Phase 2 identity). */
  sessionId?: string | null;
  /** Acting user when known (audit only, never used for tenant resolution). */
  userId?: string | null;
  /**
   * "quota" (default): atomic quota admission before retrieval — standard for
   * Clara-controlled turns. "audit-only": log the query event without quota
   * admission — for surfaces whose quota is metered elsewhere (ElevenLabs
   * Mode B admits its quota at post-call, admitting here would double-bill).
   */
  admission?: "quota" | "audit-only" | "external";
  /**
   * Text to search with, when it differs from the visitor's message (e.g. a
   * conversation-aware query in chat). `query` stays the visitor's own words
   * for intent and language detection and for the audit trail.
   */
  searchQuery?: string;
  /** Spoken replies get a "finish your sentences" line in the turn guidance. */
  channel?: "voice" | "chat";
  /** The caller already translated `searchQuery` into the KB language. */
  skipTranslation?: boolean;
  /**
   * Embedding provider override — ONLY for internal flows (public demo) that
   * must pin the embedding backbone. Selects the EMBEDDING transport, never
   * the tenant/KB/knowledge.
   */
  embeddingOverride?: ProviderConfig;
  /**
   * Draft-preview mode (authenticated agent preview): resolve against the
   * CURRENT Main-branch draft and search the LIVE collection instead of the
   * published snapshot. Never set on public/embed surfaces.
   */
  preferDraft?: boolean;
}

/** Per-stage latency of one grounding call, in milliseconds. */
export interface GroundingTimings {
  metadataMs: number;
  admissionMs: number;
  configMs: number;
  translationMs: number;
  retrievalMs: number;
  graphMs: number;
  totalMs: number;
}

export interface GroundedSource {
  index: number;
  id: string;
  title: string;
  originalFilename?: string;
  documentId?: string;
  score: number;
  snippet: string;
  sourceType: "vector";
}

export interface GraphSource {
  index: number;
  id: string;
  title: string;
  score: number;
  snippet: string;
  sourceType: "graph";
  relations: unknown;
}

/** Server-resolved knowledge binding — the plan §3.2 assertion target. */
export interface KnowledgeBinding {
  tenantId: string | null;
  agentId: string | null;
  kbId: string;
  documentId: string | null;
  ragMode: string;
}

export interface GroundingScope {
  assistantName: string;
  welcomeMessage: string;
  knowledgeBaseName: string;
  knowledgeBaseDescription: string | null;
  documentCount: number;
  documentTitles: string[];
  /** What this KB covers: admin description or topics derived from its content. */
  topics?: string;
}

export type GroundingIntent = "capability" | "knowledge" | "out_of_scope";

export interface GroundedContext {
  /** Assembled grounded context string ([S1]…/[G1]… blocks). */
  context: string;
  /** True only when retrieval produced sufficiently relevant evidence. */
  grounded: boolean;
  /** Provider-neutral response for out-of-scope questions. */
  outOfScopeReply: string;
  sources: GroundedSource[];
  graphSources: GraphSource[];
  mode: string;
  kb: { id: string; name: string; collection: string };
  /** Server-resolved binding — identical across providers for the same KB. */
  binding: KnowledgeBinding;
  /** Dynamic assistant scope used for onboarding/capability turns. */
  scope: GroundingScope;
  /** Lightweight intent classification performed before retrieval. */
  intent: GroundingIntent;
  /**
   * Provider-neutral instructions for answering THIS turn (grounded answer,
   * capability overview, or natural no-evidence handling). Every channel
   * injects it alongside the context — see modules/rag/turn-guidance.ts.
   */
  guidance: string;
  /**
   * Reply language for this turn under the assistant's language policy:
   * the visitor's language when it is allowed, otherwise the default
   * language ("Always respond in" overrides both).
   */
  responseLanguage: string;
  /** How responseLanguage was decided (visitor / not-allowed / fixed / undetected). */
  replyLanguage?: ReplyLanguageDecision;
  /** Language the KB documents are searched in. */
  knowledgeLanguage?: string;
  /** The query translated into the KB language, when one was needed. */
  retrievalQuery?: string | null;
  /** How the retrieval query was produced. */
  translation?: RetrievalTranslation["method"];
  latencyMs: number;
  timings?: GroundingTimings;
}

export type GroundingOutcome =
  | { ok: true; result: GroundedContext; warning: QuotaWarning | null }
  | {
      ok: false;
      status: number;
      error: string;
      detail?: string;
      /** Present when status is 402 — the plan_limit_exceeded contract. */
      denied?: AdmissionDenied;
    };

/** Resolve the tenant (org) + agent that own a KB — server-side only. */
async function resolveKbTenant(
  kbId: string,
): Promise<{ orgId: string | null; agentId: string | null }> {
  const rows = await dbQuery<{ org_id: string; agent_id: string }>(
    `SELECT a.org_id, a.id AS agent_id FROM agents a JOIN knowledge_bases kbx ON kbx.agent_id = a.id WHERE kbx.id = $1`,
    [kbId],
  );
  const orgId = rows[0]?.org_id ?? null;
  const agentId = rows[0]?.agent_id ?? null;
  return { orgId, agentId };
}

function isCapabilityQuery(query: string): boolean {
  const normalized = query.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  // This classifier identifies onboarding/capability intent only; it never
  // encodes customer topics. It deliberately covers common English, Tamil,
  // and mixed/romanized Tamil formulations so these turns do not depend on
  // semantic retrieval finding a matching FAQ passage.
  const patterns = [
    /\bwhat (can|do) you (do|help|answer)\b/,
    /\bhow can you help\b/,
    /\bwhat can i ask\b/,
    /\bwhat (topics|questions) (do you|can you) (cover|answer)\b/,
    /\bhow do you help\b/,
    /என்ன மாதிரி .*help/,
    /எந்தந்த .*help/,
    /எப்படி .*help/,
    /என்ன .*கேட்க/,
    /என்னென்ன .*கேட்க/,
    /என்னென்ன .*தெரியும்/,
    /எதைப் பற்றி .*பதில்/,
    /எதை பற்றி .*பதில்/,
    /எந்த .*விஷய/,
    /எந்தந்த .*விஷய/,
    /என்ன மாதிரி .*பண்ண முடியும்/,
    /எப்படி .*உதவ/,
    /உதவ முடியும்/,
    /என்ன .*டாபிக்/,
    /(कैसे|क्या) .*मदद/,
    /किन विषयों/,
    /ఎలా .*సహాయ/,
    /ఏ .*విషయాల/,
    /enna .*help/,
    /eppadi .*help/,
    /enna maathiri .*help/,
    /enna ketkalam/,
    /enna topics/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

type SearchHit = {
  id: string;
  snippet: string;
  score: number;
  payload?: Record<string, unknown>;
};

/**
 * Search the KB collection with one or more phrasings of the question (the
 * original, plus its KB-language translation when one is needed). Each
 * phrasing is embedded and searched as soon as it is available — the
 * original does not wait for the translation — and hits are merged by best
 * score per point.
 */
async function searchKbCollection(
  collectionName: string,
  queries: Array<string | Promise<string | null> | null>,
  topK: number,
  filter?: Record<string, unknown>,
  providerConfig?: ProviderConfig,
  scoreThreshold = SCORE_THRESHOLD,
): Promise<SearchHit[]> {
  const client = getQdrantClient();
  const seen = new Set<string>();
  const lists = await Promise.all(
    queries.map(async (input) => {
      const text = (await input)?.trim();
      const key = text?.toLowerCase();
      if (!text || !key || seen.has(key)) return [];
      seen.add(key);
      const embedding = await embedQueryCached(providerConfig, text);
      return searchKbVector(client, collectionName, embedding, topK, filter, scoreThreshold);
    }),
  );

  const best = new Map<string, SearchHit>();
  for (const hit of lists.flat()) {
    const current = best.get(hit.id);
    if (!current || hit.score > current.score) best.set(hit.id, hit);
  }
  const mapped = [...best.values()].sort((a, b) => b.score - a.score);

  if (filter) return mapped.slice(0, topK);

  return diversifyByDocument(mapped, {
    getDocId: (r) => (r.payload?.documentId ? String(r.payload.documentId) : undefined),
    getScore: (r) => r.score,
    topK,
  });
}

async function searchKbVector(
  client: ReturnType<typeof getQdrantClient>,
  collectionName: string,
  embedding: number[],
  topK: number,
  filter?: Record<string, unknown>,
  scoreThreshold = SCORE_THRESHOLD,
): Promise<SearchHit[]> {

  // Fetch a wider candidate pool so a document-scoped filter isn't required
  // just to keep a smaller document's chunks from being crowded out by a
  // larger one in the same KB collection.
  const fetchLimit = filter ? topK : candidatePoolSize(topK);

  const searchParams: Record<string, unknown> = {
    vector: embedding,
    limit: fetchLimit,
    // Only the fields the context builder reads — smaller responses from
    // Qdrant (https://qdrant.tech/documentation/concepts/payload/).
    with_payload: ["chunk", "title", "originalFilename", "documentId"],
    score_threshold: scoreThreshold,
    ...(filter ? { filter } : {}),
  };

  let results;
  try {
    results = await client.search(
      collectionName,
      searchParams as Parameters<typeof client.search>[1],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(msg)) {
      throw new Error(
        `Qdrant collection "${collectionName}" does not exist. Documents may still be processing — check the ingest worker status at /api/worker/ingest or re-upload your documents.`,
      );
    }
    throw err;
  }

  // A zero-hit result is intentionally treated as "no grounded answer".
  // Never remove the score threshold as a fallback: weak semantic matches
  // must not become context for an out-of-scope question.

  return (
    results as Array<{ id: string | number; score?: number; payload?: Record<string, unknown> }>
  ).map((r) => ({
    id: String(r.id),
    snippet: r.payload?.chunk ? String(r.payload.chunk) : "",
    score: r.score ?? 0,
    payload: r.payload as Record<string, unknown>,
  }));
}

function graphBudgetMs(): number {
  const value = Number(process.env.GROUNDING_GRAPH_BUDGET_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_GRAPH_BUDGET_MS;
}

/** Resolve with `fallback` if `promise` has not settled within `ms`. */
function settleWithin<T>(promise: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[grounding] ${label} exceeded ${ms}ms — continuing without it`);
      resolve(fallback);
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => {
        clearTimeout(timer);
        console.warn(`[grounding] ${label} failed:`, (error as Error)?.message ?? error);
        resolve(fallback);
      },
    );
  });
}

/**
 * The one authenticated Clara grounding entry point.
 *
 * Deterministic binding: for the same kbId (+ optional documentId), the
 * resolved tenantId/agentId/kbId/documentId/ragMode are IDENTICAL regardless
 * of which voice provider initiated the turn — that invariance is what plan
 * Task 3.2 asserts.
 */
export async function groundClaraContext(request: GroundingRequest): Promise<GroundingOutcome> {
  const query = (request.query ?? "").trim();
  if (!query) {
    return { ok: false, status: 400, error: "Missing query" };
  }
  const topK = Math.min(Number(request.topK ?? DEFAULT_TOP_K), MAX_TOP_K);

  const t0 = Date.now();
  // The embedding/AI config only depends on kbId — resolve it alongside the
  // KB metadata instead of after it (it is cached for 30 s per KB).
  const resolvedPromise = resolveGroundingAIConfig(request.kbId, request.preferDraft === true);
  let resolvedEarly: Awaited<typeof resolvedPromise> | null = null;
  resolvedPromise.then((value) => { resolvedEarly = value; }, () => {});
  const resolvedSnapshot = (): Awaited<typeof resolvedPromise> | null => resolvedEarly;
  const { value: metadata } = await getGroundingMetadata(request.kbId);
  const { kb, assistantConfig, documentTitles, tenant } = metadata;
  if (!kb) {
    return { ok: false, status: 404, error: "Knowledge base not found" };
  }
  if (kb.status !== "active") {
    return { ok: false, status: 400, error: "Knowledge base is archived" };
  }
  const metadataMs = Date.now() - t0;

  const scope: GroundingScope = {
    assistantName: assistantConfig?.assistantName ?? kb.name,
    welcomeMessage: assistantConfig?.welcomeMessage ?? "",
    knowledgeBaseName: kb.name,
    knowledgeBaseDescription:
      typeof (kb as { description?: unknown }).description === "string"
        ? (kb as { description: string }).description
        : null,
    documentCount: documentTitles.length,
    documentTitles,
  };

  // ── Tenant binding: derived server-side from the KB row, never from input.
  const { orgId, agentId } = tenant;
  // ── Language policy: start in the default language; reply in the
  // visitor's language only when it is allowed; otherwise the default.
  const languagePolicy = normalizeLanguagePolicy({
    defaultLanguage: assistantConfig?.defaultLanguage,
    allowedLanguages: assistantConfig?.allowedLanguages,
    alwaysRespondIn: assistantConfig?.alwaysRespondIn,
  });
  const visitorLanguage = detectVisitorLanguage(query, languagePolicy.allowedLanguages);
  const replyLanguage = resolveReplyLanguage(languagePolicy, visitorLanguage);
  const responseLanguage = replyLanguage.language ?? languagePolicy.defaultLanguage;
  const languageDirective = replyLanguageDirective(languagePolicy, replyLanguage);
  const fallbackReply =
    assistantConfig?.outOfScopeReply ??
    "I don't have enough information in the configured knowledge base to answer that accurately.";
  // Topics come from this tenant's own KB (admin description, else a cached
  // summary of its indexed content, else document titles) — never hardcoded.
  const topicsFor = (waitMs: number) =>
    getKnowledgeTopics({
      collection: kb.qdrantCollection,
      description: scope.knowledgeBaseDescription,
      documentTitles,
      waitMs,
    }).catch(() => documentTitles.join(", "));
  // Start (or reuse) the topic summary now so it is ready by the time a
  // capability or no-evidence turn needs it.
  void topicsFor(0);
  // Capability/onboarding turns are intentionally resolved before vector search.
  // They should work even when the KB contains no FAQ phrased like the visitor's
  // question, and their answer is derived from the current assistant/KB config.
  if (isCapabilityQuery(query)) {
    const topics = await topicsFor(TOPICS_WAIT_MS);
    scope.topics = topics;
    const capabilityLines = [
      scope.welcomeMessage.trim(),
      topics ? `Topics you can help with: ${topics}` : "",
      scope.documentTitles.length > 0
        ? `Available knowledge sources: ${scope.documentTitles.join(", ")}.`
        : "",
    ].filter(Boolean);

    return {
      ok: true,
      warning: null,
      result: {
        context: capabilityLines.join("\n\n"),
        grounded: false,
        outOfScopeReply: fallbackReply,
        sources: [],
        graphSources: [],
        mode: getRagRuntimeConfig({ requestedMode: request.ragMode ?? undefined }).ragMode,
        kb: { id: kb.id, name: kb.name, collection: kb.qdrantCollection },
        binding: {
          tenantId: orgId,
          agentId,
          kbId: kb.id,
          documentId: request.documentId ?? null,
          ragMode: getRagRuntimeConfig({ requestedMode: request.ragMode ?? undefined }).ragMode,
        },
        scope,
        intent: "capability",
        guidance: buildTurnGuidance({
          grounded: false,
          intent: "capability",
          languageDirective,
          fallbackReply,
          topics,
          channel: request.channel,
        }),
        responseLanguage,
        replyLanguage,
        latencyMs: Date.now() - t0,
      },
    };
  }


  // ── Atomic quota admission (org-wide, rolling 24h). It is a database
  // transaction, so it runs ALONGSIDE retrieval (embedding + vector search
  // are network calls) instead of in front of it; nothing is returned until
  // the turn is admitted, and an over-limit turn still gets the 402.
  // Audit-only surfaces log the event AFTER retrieval instead (their quota
  // is metered at a different point in the turn lifecycle).
  const admissionMode = request.admission ?? "quota";
  let admission: Awaited<ReturnType<typeof admitQueryEvent>> | null = null;
  let admissionMs = 0;
  const admissionStarted = Date.now();
  const admissionPromise = admissionMode === "quota"
    ? admitQueryEvent({
        orgId,
        kbId: kb.id,
        queryText: query,
        surface: request.surface ?? "search",
        ...(request.sessionId ? { sessionId: request.sessionId } : {}),
        ...(request.userId !== undefined ? { userId: request.userId } : {}),
      }).then((result) => {
        admissionMs = Date.now() - admissionStarted;
        return result;
      })
    : null;
  // Observed below; this only keeps an early return from leaving it unhandled.
  admissionPromise?.catch(() => {});

  // ── Cross-lingual retrieval: when the visitor asks in another language
  // than the KB documents, also search with a KB-language translation. It
  // starts NOW, in parallel with the AI-config resolution below (which can
  // take seconds on a cold instance), using the org's configured translation
  // when that config is already available and the platform model otherwise.
  const searchText = (request.searchQuery ?? query).trim() || query;
  const knowledgeLanguage = inferKnowledgeLanguage(documentTitles, assistantConfig?.defaultLanguage);
  const early = resolvedSnapshot();
  // A multilingual index (E5) matches questions across languages by itself —
  // no translation hop on the critical path, like ElevenLabs' multilingual RAG.
  const indexHint = await getCollectionEmbedding(early?.knowledgeCollection ?? kb.qdrantCollection).catch(() => null);
  const multilingualIndex =
    indexHint?.index === "multilingual" && process.env.RAG_TRANSLATE_WITH_MULTILINGUAL_INDEX !== "true";
  const translationPromise: Promise<RetrievalTranslation> = !request.skipTranslation && !multilingualIndex && needsRetrievalTranslation({
    query,
    kbLanguage: knowledgeLanguage,
    detectedLanguage: visitorLanguage,
  })
    ? translateQueryForRetrieval({
        query: searchText,
        kbLanguage: knowledgeLanguage,
        translationMode: early?.translationMode,
        orgId,
        kbId: kb.id,
        agentId,
        providerConfig: early ? toProviderConfig(early, "embedding") : undefined,
      })
    : Promise.resolve({ query: null, method: "none", ms: 0 });

  const configStarted = Date.now();
  const resolved = await resolvedPromise;
  const searchCollection = resolved.knowledgeCollection ?? kb.qdrantCollection;
  // Embed the question with the model that BUILT this collection (registry),
  // never just today's setting — a model change must not break search.
  const providerConfig =
    request.embeddingOverride ??
    (await resolveSearchEmbedding(searchCollection, toProviderConfig(resolved!, "embedding"), kb.id));
  const scoreThreshold = scoreThresholdFor(providerConfig.provider, providerConfig.embeddingModel, SCORE_THRESHOLD);
  const configMs = Date.now() - configStarted;

  const runtime = getRagRuntimeConfig({
    requestedMode: (request.ragMode ?? undefined) as string | undefined,
  });

  const filter = request.documentId
    ? { must: [{ key: "documentId", match: { value: request.documentId } }] }
    : undefined;

  const graphStarted = Date.now();
  const graphPromise = runtime.enableGraphRag
    ? settleWithin(
        retrieveGraphContext({
          kbId: kb.id,
          query,
          topK: Math.min(topK, 4),
          documentId: request.documentId ?? undefined,
        }),
        graphBudgetMs(),
        [],
        "graph retrieval",
      )
    : Promise.resolve([]);

  const retrievalStarted = Date.now();
  let vectorResults: SearchHit[];
  try {
    vectorResults = await searchKbCollection(
      searchCollection,
      [searchText, translationPromise.then((t) => t.query)],
      topK,
      filter,
      providerConfig,
      scoreThreshold,
    );
  } catch (searchErr) {
    const msg = (searchErr as Error).message;
    if (msg.includes("does not exist")) {
      return {
        ok: false,
        status: 503,
        error:
          "This knowledge base has no indexed content yet. Please upload documents and wait for them to finish processing.",
        detail: msg,
      };
    }
    throw searchErr;
  }

  // Vector and graph retrieval are independent; the graph request is started
  // before vector search so hybrid/agentic turns overlap remote latency.
  const retrievalMs = Date.now() - retrievalStarted;
  const translation = await translationPromise;
  const graphHits = await graphPromise;
  const graphMs = Date.now() - graphStarted;

  if (admissionPromise) {
    admission = await admissionPromise;
    if (!admission.admitted) {
      return { ok: false, status: 402, error: "plan_limit_exceeded", denied: admission };
    }
  }

  const graphContext = graphHits
    .map((hit, index) => {
      const relations = hit.relations
        .slice(0, 3)
        .map((relation) => `${relation.source} -[${relation.type}]-> ${relation.target}`)
        .join("; ");
      const evidence = hit.supportingChunks
        .slice(0, 2)
        .map((chunk) => chunk.text)
        .filter(Boolean)
        .join("\n");

      return [
        `[G${index + 1}] ${hit.label}`,
        `Type: ${hit.type}`,
        relations ? `Relations: ${relations}` : "",
        evidence ? `Evidence: ${evidence}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  if (admissionMode === "external") {
    // The caller owns the query event (it admits and finalises it with the
    // generated answer) — logging here would count the turn twice.
  } else if (admissionMode === "quota") {
    void finalizeQueryEvent(admission && admission.admitted ? admission.eventId : null, {
      answerText: "",
      sourceCount: vectorResults.length + graphHits.length,
      latencyMs: Date.now() - t0,
      status: "ok",
    });
  } else {
    // Audit-only: same audit row shape, no quota semantics (§11.10 — query
    // text + snippet count, never snippet bodies).
    void logQueryEvent({
      kbId: kb.id,
      orgId,
      queryText: query,
      sourceCount: vectorResults.length + graphHits.length,
      surface: request.surface ?? "voice",
      status: "ok",
      answerText: null,
    }).catch((error) => {
      console.warn("[grounding] audit-only query event failed:", (error as Error).message);
    });
  }

  const contextParts = [
    vectorResults
      .map((r, i) => {
        const title = r.payload?.title ? String(r.payload.title) : "Document";
        const filename = r.payload?.originalFilename ? String(r.payload.originalFilename) : "";
        const label = filename && filename !== title ? `${title} (${filename})` : title;
        return `[S${i + 1}] ${label}
${r.snippet}`.trim();
      })
      .join("\n\n"),
  ];

  if (graphContext) {
    contextParts.push(`Graph context
${graphContext}`);
  }

  const context = contextParts.filter(Boolean).join("\n\n");

  const sources: GroundedSource[] = vectorResults.map((r, i) => ({
    index: i + 1,
    id: r.id,
    title: r.payload?.title ? String(r.payload.title) : "Document",
    originalFilename: r.payload?.originalFilename ? String(r.payload.originalFilename) : undefined,
    documentId: r.payload?.documentId ? String(r.payload.documentId) : undefined,
    score: r.score,
    snippet: r.snippet,
    sourceType: "vector",
  }));

  const graphSources: GraphSource[] = graphHits.map((hit, index) => ({
    index: index + 1,
    id: hit.id,
    title: hit.label,
    score: hit.score,
    snippet: hit.supportingChunks
      .map((chunk) => chunk.text)
      .filter(Boolean)
      .join(" ")
      .slice(0, 500),
    sourceType: "graph",
    relations: hit.relations,
  }));

  const grounded = sources.length > 0 || graphSources.length > 0;
  // Topics only matter when there is no evidence (to steer the visitor to
  // what the KB covers); the summary is usually cached or already computing.
  if (!grounded) scope.topics = await topicsFor(TOPICS_WAIT_MS / 2);
  const outOfScopeReply = resolved.assistantConfig?.outOfScopeReply ?? fallbackReply;

  return {
    ok: true,
    warning: admission && admission.admitted ? admission.warning : null,
    result: {
      context,
      sources,
      graphSources,
      mode: runtime.ragMode,
      grounded,
      outOfScopeReply,
      guidance: buildTurnGuidance({
        grounded,
        intent: "knowledge",
        languageDirective,
        fallbackReply: outOfScopeReply,
        topics: scope.topics,
        channel: request.channel,
      }),
      kb: {
        id: kb.id,
        name: kb.name,
        collection: resolved.knowledgeCollection ?? kb.qdrantCollection,
      },
      scope,
      intent: "knowledge",
      responseLanguage,
      replyLanguage,
      knowledgeLanguage,
      retrievalQuery: translation.query,
      translation: translation.method,
      binding: {
        tenantId: orgId,
        agentId,
        kbId: kb.id,
        documentId: request.documentId ?? null,
        ragMode: runtime.ragMode,
      },
      latencyMs: Date.now() - t0,
      timings: {
        metadataMs,
        admissionMs,
        configMs,
        translationMs: translation.ms,
        retrievalMs,
        graphMs,
        totalMs: Date.now() - t0,
      },
    },
  };
}

/** Test hook — clears the per-process grounding caches. */
export function resetGroundingCaches(): void {
  groundingResolutionCache.clear();
  metadataCache.clear();
  metadataInFlight.clear();
}
