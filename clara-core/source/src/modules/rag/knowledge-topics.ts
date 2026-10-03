/**
 * src/modules/rag/knowledge-topics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * "What can this assistant help with?" — derived from each tenant's own
 * knowledge base, never hardcoded.
 *
 *   1. The admin's knowledge-base description, when set (authoritative).
 *   2. Otherwise a short topic list summarised from a sample of the KB's own
 *      indexed chunks (one small completion per KB, cached in-process).
 *   3. Until that is ready — or if it fails — the document titles.
 *
 * Used for capability questions ("how can you help me?", "what topics do you
 * cover?") and to steer unanswerable questions back to what the KB covers,
 * instead of a canned topic-restriction refusal.
 */

import type { ProviderConfig } from "@/modules/ai-core/types";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { getQdrantClient } from "@/modules/admin/core/vector-store";

const TTL_MS = 6 * 60 * 60 * 1000;
/** After a failed/empty summary, use the titles for this long before retrying. */
const RETRY_AFTER_MS = 10 * 60 * 1000;
const SAMPLE_POINTS = 16;
const SNIPPET_CHARS = 400;

const cache = new Map<string, { value: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string | null>>();

function titlesFallback(documentTitles: string[]): string {
  return documentTitles.filter(Boolean).slice(0, 20).join(", ");
}

async function summariseTopics(
  collection: string,
  providerConfig: ProviderConfig | undefined,
): Promise<string | null> {
  const client = getQdrantClient();
  const page = await client.scroll(collection, {
    limit: SAMPLE_POINTS,
    with_payload: ["chunk", "title"],
    with_vector: false,
  });
  const snippets = (page.points ?? [])
    .map((point) => {
      const payload = (point.payload ?? {}) as { chunk?: unknown };
      return typeof payload.chunk === "string" ? payload.chunk.replace(/\s+/g, " ").slice(0, SNIPPET_CHARS) : "";
    })
    .filter(Boolean);
  if (snippets.length === 0) return null;

  const provider = ProviderFactory.getProvider(providerConfig);
  let output = "";
  for await (const chunk of provider.chatStream(
    [
      {
        role: "system",
        content:
          "You label knowledge bases. From the excerpts, list the main subjects a visitor could ask about, " +
          "as a comma-separated list of at most 10 short topics in English. Reply with the list only.",
      },
      { role: "user", content: snippets.map((s, i) => `(${i + 1}) ${s}`).join("\n") },
    ],
    { temperature: 0, maxTokens: 120 },
  )) {
    output += chunk;
  }
  const topics = output.replace(/\s+/g, " ").replace(/^["'\s]+|["'\s.]+$/g, "").trim();
  return topics && topics.length <= 600 ? topics : null;
}

/**
 * Topics for a knowledge base. Never throws. Waits at most `waitMs` for a
 * summary that is not cached yet; the summary keeps computing in the
 * background and is used by later turns.
 */
export async function getKnowledgeTopics(params: {
  collection: string;
  description?: string | null;
  documentTitles: string[];
  providerConfig?: ProviderConfig;
  waitMs?: number;
}): Promise<string> {
  const description = params.description?.trim();
  if (description) return description;

  const fallback = titlesFallback(params.documentTitles);
  if (!params.collection) return fallback;

  const key = `${params.collection}|${params.documentTitles.length}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let pending = inFlight.get(key);
  if (!pending) {
    pending = summariseTopics(params.collection, params.providerConfig)
      .then((value) => {
        cache.set(key, value
          ? { value, expiresAt: Date.now() + TTL_MS }
          : { value: fallback, expiresAt: Date.now() + RETRY_AFTER_MS });
        return value;
      })
      .catch((err: unknown) => {
        console.warn("[knowledge-topics] summary failed:", (err as Error)?.message ?? err);
        cache.set(key, { value: fallback, expiresAt: Date.now() + RETRY_AFTER_MS });
        return null;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }

  const waitMs = params.waitMs ?? 0;
  if (waitMs <= 0) return fallback;
  const value = await Promise.race([
    pending,
    new Promise<null>((resolve) => {
      const timer = setTimeout(() => resolve(null), waitMs);
      if (typeof timer.unref === "function") timer.unref();
    }),
  ]);
  return value ?? fallback;
}

/** Test hook. */
export function clearKnowledgeTopicsCache(): void {
  cache.clear();
  inFlight.clear();
}
