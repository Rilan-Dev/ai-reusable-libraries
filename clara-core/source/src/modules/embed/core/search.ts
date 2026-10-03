/**
 * src/modules/embed/core/search.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin wrapper around Qdrant search used by public embed endpoints.
 * Keeps embed routes clean — no direct Qdrant imports needed there.
 */

import { getQdrantClient } from "@/modules/admin/core/vector-store";
import { embedQueryCached } from "@/modules/rag/query-embedding-cache";
import type { ProviderConfig } from "@/modules/ai-core/types";
import { candidatePoolSize, diversifyByDocument } from "@/modules/rag/diversify";

const SCORE_THRESHOLD = 0.25;

export type EmbedSearchResult = {
  id: string;
  title: string;
  snippet: string;
  score: number;
  documentId?: string;
};

export async function searchKbEmbedded(
  collectionName: string,
  query: string,
  topK = 6,
  options?: {
    providerConfig?: ProviderConfig;
    filter?: Record<string, unknown>;
    /** Realtime voice fast path: avoid the wider candidate pool/diversification. */
    realtimeVoice?: boolean;
    /**
     * The query translated into the KB language (cross-lingual retrieval).
     * Searched in parallel with the original; best score per point wins.
     */
    translatedQuery?: Promise<string | null> | string | null;
    /** Minimum similarity for this collection's embedding model. */
    scoreThreshold?: number;
  },
): Promise<EmbedSearchResult[]> {
  const phrasings = await Promise.all([
    searchOnePhrasing(collectionName, query, topK, options),
    Promise.resolve(options?.translatedQuery ?? null).then((translated) =>
      translated && translated.trim().toLowerCase() !== query.trim().toLowerCase()
        ? searchOnePhrasing(collectionName, translated, topK, options)
        : [],
    ),
  ]);

  const best = new Map<string, EmbedSearchResult>();
  for (const hit of phrasings.flat()) {
    const current = best.get(hit.id);
    if (!current || hit.score > current.score) best.set(hit.id, hit);
  }
  const mapped = [...best.values()].sort((a, b) => b.score - a.score);

  if (options?.filter || options?.realtimeVoice) return mapped.slice(0, topK);

  return diversifyByDocument(mapped, {
    getDocId: (r) => r.documentId,
    getScore: (r) => r.score,
    topK,
  });
}

async function searchOnePhrasing(
  collectionName: string,
  query: string,
  topK: number,
  options?: { providerConfig?: ProviderConfig; filter?: Record<string, unknown>; realtimeVoice?: boolean; scoreThreshold?: number },
): Promise<EmbedSearchResult[]> {
  const client = getQdrantClient();
  const embeddingStart = Date.now();
  const embedding = await embedQueryCached(options?.providerConfig, query);
  const embeddingMs = Date.now() - embeddingStart;

  // Fetch a larger candidate pool than topK so that when a KB has multiple
  // documents, a smaller/less-chunky document still has a chance to surface
  // relevant chunks instead of being drowned out by a document with far more
  // chunks (e.g. a 71-chunk FAQ PDF vs a 27-chunk project DOCX). The pool is
  // narrowed back down to topK below via diversifyByDocument, unless an
  // explicit documentId filter is already scoping the search to one document.
  const fetchLimit = options?.filter || options?.realtimeVoice ? topK : candidatePoolSize(topK);

  const searchParams = {
    vector: embedding,
    limit: fetchLimit,
    with_payload: ["chunk", "title", "documentId"],
    score_threshold: options?.scoreThreshold ?? SCORE_THRESHOLD,
    ...(options?.filter ? { filter: options.filter } : {}),
  };

  let results: unknown[] = [];
  try {
    const qdrantStart = Date.now();
    results = await client.search(collectionName, searchParams as Parameters<typeof client.search>[1]);
    console.info("[realtime-latency] vector search stages", {
      realtimeVoice: options?.realtimeVoice === true,
      embeddingMs,
      qdrantMs: Date.now() - qdrantStart,
      fetchLimit,
    });

    // Zero results means there is no sufficiently relevant KB evidence.
    // Do not retry without the threshold; weak matches must not become
    // grounding context for an out-of-scope question.
  } catch (err) {
    console.warn(`[searchKbEmbedded] Failed to search collection '${collectionName}':`, (err as Error).message);
    // If the collection doesn't exist (e.g. unseeded demo), just return no results
    // rather than throwing a 500 error, so the LLM can still reply gracefully.
    return [];
  }

  return (
    results as Array<{
      id: string | number;
      score?: number;
      payload?: Record<string, unknown>;
    }>
  )
    .map((r) => ({
      id: String(r.id),
      title: r.payload?.title ? String(r.payload.title) : "Document",
      snippet: r.payload?.chunk ? String(r.payload.chunk) : "",
      score: r.score ?? 0,
      documentId: r.payload?.documentId ? String(r.payload.documentId) : undefined,
    }));
}
