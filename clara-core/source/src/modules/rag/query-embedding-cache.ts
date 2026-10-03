/**
 * src/modules/rag/query-embedding-cache.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * In-process cache for QUERY embeddings on the realtime grounding path.
 *
 * Voice visitors repeat questions ("what are your hours?", retries after a
 * barge-in, the same FAQ asked by many callers). Each repeat used to pay a
 * full embedding API round trip before Qdrant could even be queried. The
 * embedding of a text is deterministic for a given provider + model +
 * dimension, so it is safe to reuse.
 *
 *   • keyed by provider, model, dimension and the whitespace-normalised text
 *   • concurrent requests for the same key share one in-flight call
 *   • vectors are stored as Float32Array (what the providers return anyway)
 *     to halve memory; bounded LRU with a TTL
 */

import { ProviderFactory } from "@/modules/ai-core/factory";
import type { ProviderConfig } from "@/modules/ai-core/types";

const MAX_ENTRIES = 1000;
const TTL_MS = 30 * 60 * 1000;

type Entry = { vector: Float32Array; expiresAt: number };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<number[]>>();

function normaliseText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function cacheKey(config: ProviderConfig | undefined, text: string): string {
  return [
    config?.provider ?? "default",
    config?.embeddingModel ?? "",
    config?.embeddingDimension ?? "",
    normaliseText(text),
  ].join("|");
}

export async function embedQueryCached(
  config: ProviderConfig | undefined,
  text: string,
): Promise<number[]> {
  const key = cacheKey(config, text);
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    // Refresh LRU position.
    cache.delete(key);
    cache.set(key, hit);
    return Array.from(hit.vector);
  }
  if (hit) cache.delete(key);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = ProviderFactory.getProvider(config)
    .embedText(normaliseText(text))
    .then((vector) => {
      cache.set(key, { vector: Float32Array.from(vector), expiresAt: Date.now() + TTL_MS });
      while (cache.size > MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
      return vector;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, request);
  return request;
}

/** Test hook. */
export function clearQueryEmbeddingCache(): void {
  cache.clear();
  inFlight.clear();
}
