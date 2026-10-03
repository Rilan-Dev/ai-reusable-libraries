/**
 * src/modules/admin/core/vector-store-kb.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Extended Qdrant upsert that writes kbId + documentId into every chunk payload.
 * This enables:
 *   1. Multi-document RAG search over a full collection (no filter needed)
 *   2. Per-document filtering: { must: [{ key:"documentId", match:{value:docId} }] }
 *   3. Source attribution in answers: payload.originalFilename, payload.title
 *   4. Clean deletion of a single document's chunks from Qdrant by documentId filter
 *
 * The existing upsertDocuments() in vector-store.ts remains unchanged so that
 * legacy code paths (admin ingest scripts) continue to work.
 */

import { randomUUID } from "node:crypto";
import { getQdrantClient, ensureCollectionExists } from "./vector-store";
import { ProviderFactory } from "@/modules/ai-core/factory";
import type { ProviderConfig } from "@/modules/ai-core/types";
import { logUsageEvent } from "@/modules/knowledge-bases/core/analytics-db";
import {
  copyCollectionEmbedding,
  getActiveReindexJob,
  getCollectionEmbedding,
  getKbIndexContext,
  providerConfigFor,
  resolveWriteEmbedding,
  type ReindexJob,
} from "@/modules/knowledge-bases/core/embedding-index";

// Re-use batch config from env
const EMBED_BATCH_SIZE = (() => {
  const v = Number(process.env.EMBED_BATCH_SIZE ?? "20");
  return Number.isFinite(v) && v > 0 ? v : 20;
})();

const EMBED_BATCH_DELAY_MS = (() => {
  const v = Number(process.env.EMBED_BATCH_DELAY ?? "300");
  return Number.isFinite(v) && v >= 0 ? v : 300;
})();

const EMBED_MAX_RETRIES = (() => {
  const v = Number(process.env.EMBED_MAX_RETRIES ?? "4");
  return Number.isFinite(v) && v >= 0 ? v : 4;
})();

const UPSERT_BATCH_SIZE = (() => {
  const v = Number(process.env.UPSERT_BATCH_SIZE ?? "200");
  return Number.isFinite(v) && v > 0 ? v : 200;
})();

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

/** Metadata injected into every Qdrant point for a KB-aware document */
export type KbChunkMeta = {
  kbId:             string;
  documentId:       string;
  title:            string;
  originalFilename: string;
};

// ── embed with retry ──────────────────────────────────────────────────────────

/** Errors worth retrying: rate limits, timeouts, and dropped connections. */
function isRetryableEmbedError(err: unknown): boolean {
  const e = err as Record<string, unknown>;
  if (typeof e?.status === "number" && e.status === 429) return true;
  const msg = String(e?.message ?? "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("eai_again") ||
    msg.includes("socket hang up") ||
    msg.includes("fetch failed") ||
    msg.includes("connection error") ||
    msg.includes("service unavailable") ||
    msg.includes("bad gateway") ||
    msg.includes("overloaded")
  );
}

/**
 * Human-readable description of the embedding provider for error messages —
 * operators need to know WHICH provider/endpoint failed to act on it.
 */
function describeProvider(provider: { getProviderName(): string; getModelName(t: "embedding"): string }): string {
  const name = provider.getProviderName();
  const model = provider.getModelName("embedding");
  const host =
    name === "openai"
      ? process.env.OPENAI_BASE_URL?.replace(/\/v\d+\/?$/, "") || "api.openai.com"
      : name === "tei"
        ? process.env.MULTILINGUAL_EMBEDDINGS_BASE_URL?.trim() || "multilingual embeddings endpoint"
        : "generativelanguage.googleapis.com";
  return `${name}/${model} @ ${host}`;
}

async function embedBatchWithRetry(
  texts: string[],
  providerConfig: ProviderConfig,
  attempt = 0,
  metering?: {
    orgId?: string | null;
    kbId?: string | null;
    documentId?: string | null;
    onTokens?: (tokens: number) => void;
  },
): Promise<number[][]> {
  const provider = ProviderFactory.getProvider(providerConfig);
  const providerDesc = describeProvider(provider);
  try {
    // WS-1.1: the usage callback feeds the usage-event spine (ingestion
    // metering) — tokens are provider-reported, never estimated.
    const embeddings = await provider.embedBatch(texts, {
      onUsage: metering?.onTokens
        ? (u) => metering.onTokens!(u.promptTokens)
        : undefined,
    });
    return embeddings;
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    const status = typeof e?.status === "number" ? e.status
      : String(e?.message ?? "").includes("429") ? 429 : 0;
    const retryable = status === 429 || isRetryableEmbedError(err);
    if (retryable && attempt < EMBED_MAX_RETRIES) {
      const wait = Math.min(1_000 * 2 ** attempt, 30_000);
      console.warn(
        `[vs-kb] embedding batch failed (${providerDesc}), retrying in ${wait}ms (attempt ${attempt + 1}/${EMBED_MAX_RETRIES}): ${(e?.message as string) ?? err}`
      );
      await sleep(wait);
      return embedBatchWithRetry(texts, providerConfig, attempt + 1, metering);
    }
    // Attach provider context so document error_messages in the UI and logs
    // say exactly what failed and where, instead of a bare "Request timed out."
    const detail = (e?.message as string) ?? String(err);
    const hint =
      /timed out|timeout|econnrefused|enotfound|eai_again|fetch failed|connection error|not supported/i.test(detail)
        ? " — the embedding provider is unreachable from this server. Check outbound network access (or region restrictions) and switch provider in settings if needed."
        : "";
    throw new Error(`Embedding failed (${providerDesc}): ${detail}${hint}`);
  }
}

export async function embedBatches(
  texts: string[],
  providerConfig: ProviderConfig,
  metering?: {
    orgId?: string | null;
    kbId?: string | null;
    documentId?: string | null;
  },
): Promise<number[][]> {
  const results: number[][] = [];
  const totalBatches = Math.ceil(texts.length / EMBED_BATCH_SIZE);
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const batchNum = Math.floor(i / EMBED_BATCH_SIZE) + 1;
    console.log(`[vs-kb] embedding batch ${batchNum}/${totalBatches} (${batch.length} chunks)`);
    // One API call per batch (provider batch endpoint) instead of N parallel
    // single-text calls — fewer requests, fewer rate limits, faster ingest.
    // WS-1.1: each batch appends one EMBEDDING usage event (tokens + cost).
    const embeddings = await embedBatchWithRetry(batch, providerConfig, 0, {
      ...metering,
      onTokens: (tokens) => {
        const provider = ProviderFactory.getProvider(providerConfig);
        void logUsageEvent({
          kind: "EMBEDDING",
          model: provider.getModelName("embedding"),
          provider: provider.getProviderName(),
          orgId: metering?.orgId ?? null,
          kbId: metering?.kbId ?? null,
          documentId: metering?.documentId ?? null,
          promptTokens: tokens,
          metadata: { batch: batchNum, chunks: batch.length },
        });
      },
    });
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Embedding provider returned ${embeddings.length} vectors for ${batch.length} inputs`
      );
    }
    results.push(...embeddings);
    if (i + EMBED_BATCH_SIZE < texts.length && EMBED_BATCH_DELAY_MS > 0) {
      await sleep(EMBED_BATCH_DELAY_MS);
    }
  }
  return results;
}

/** Single-text embed (chunk viewer edits) — reuses the batch retry wrapper. */
async function embedWithRetry(text: string, providerConfig: ProviderConfig): Promise<number[]> {
  const [embedding] = await embedBatchWithRetry([text], providerConfig);
  if (!embedding) throw new Error("Embedding provider returned no vector for the input text");
  return embedding;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Embed and upsert text chunks into a KB-scoped Qdrant collection.
 *
 * Every point in Qdrant will have payload:
 *   { kbId, documentId, title, originalFilename, chunk, chunkIndex, uploadedAt }
 *
 * This allows:
 *   • Full-collection search (all docs in this KB) — no filter
 *   • Single-document search — filter by documentId
 *   • Source citation — payload.title, payload.originalFilename
 */
export async function upsertDocumentsKb(
  collectionName: string,
  textChunks: string[],
  meta: KbChunkMeta
): Promise<void> {
  if (textChunks.length === 0) return;

  // Write with the model that built THIS collection (kb_vector_collections);
  // a new collection is built with the KB's chosen index.
  const [{ config: providerConfig, entry }, context] = await Promise.all([
    resolveWriteEmbedding(meta.kbId, collectionName),
    getKbIndexContext(meta.kbId),
  ]);

  await ensureCollectionExists(collectionName, { vectorSize: entry.dimension });
  await ensureDocumentIdIndex(collectionName);

  const metering = { orgId: context?.orgId ?? null, kbId: meta.kbId, documentId: meta.documentId };
  const embeddings = await embedBatches(textChunks, providerConfig, metering);
  const uploadedAt = new Date().toISOString();

  const points = textChunks.map((chunk, index) => ({
    id: randomUUID(),
    vector: embeddings[index]!,
    payload: {
      // KB & document attribution (Phase 2 additions)
      kbId:             meta.kbId,
      documentId:       meta.documentId,
      title:            meta.title,
      originalFilename: meta.originalFilename,
      // Chunk content
      chunk,
      chunkIndex: index,
      uploadedAt,
    },
  }));

  await upsertPointBatches(collectionName, points);
  console.log(`[vs-kb] ✅ upserted ${points.length} points into "${collectionName}"`);

  // A re-index in progress builds the next collection from a snapshot of
  // this one — write new chunks there too (same point ids) so nothing added
  // during the re-index is lost at the swap.
  await dualWrite(meta.kbId, collectionName, async (job) => {
    const next = await embedBatches(textChunks, providerConfigFor(job), metering);
    await upsertPointBatches(
      job.targetCollection,
      points.map((point, index) => ({ ...point, vector: next[index]! })),
    );
  });
}

type KbPoint = { id: string; vector: number[]; payload: Record<string, unknown> };

async function upsertPointBatches(collectionName: string, points: KbPoint[]): Promise<void> {
  const client = getQdrantClient();
  const totalBatches = Math.ceil(points.length / UPSERT_BATCH_SIZE);
  for (let i = 0; i < points.length; i += UPSERT_BATCH_SIZE) {
    const batch   = points.slice(i, i + UPSERT_BATCH_SIZE);
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1;
    console.log(`[vs-kb] upserting batch ${batchNum}/${totalBatches} (${batch.length} points) → "${collectionName}"`);
    try {
      await client.upsert(collectionName, { wait: true, points: batch });
    } catch (err: unknown) {
      const e = err as Error & { data?: unknown; status?: number };
      throw new Error(
        `[vs-kb] upsert batch ${batchNum} failed for "${collectionName}": ` +
        `${e.message} ${e.status ? `(HTTP ${e.status})` : ""} ${e.data ? `| ${JSON.stringify(e.data)}` : ""}`
      );
    }
  }
}

/**
 * Mirror a write into the KB's in-progress re-index target. Failures are
 * logged, never thrown: the live collection is the source of truth and the
 * re-index job re-copies anything it has not scrolled past yet.
 */
async function dualWrite(
  kbId: string | null | undefined,
  liveCollection: string,
  write: (job: ReindexJob) => Promise<void>,
): Promise<void> {
  if (!kbId) return;
  try {
    const job = await getActiveReindexJob(kbId);
    if (!job || job.targetCollection === liveCollection || job.sourceCollection !== liveCollection) return;
    await write(job);
  } catch (err) {
    console.warn(`[vs-kb] re-index mirror write failed for kb=${kbId}:`, (err as Error).message);
  }
}

/**
 * Create an immutable point-in-time copy of a KB collection.
 * Published deployments use this collection so later KB edits cannot alter
 * the content served by an already-published version.
 */
export async function cloneKbCollection(sourceCollection: string, targetCollection: string): Promise<void> {
  const client = getQdrantClient();
  const source = await client.getCollection(sourceCollection);
  const vectors = source.config.params.vectors;
  if (!vectors) throw new Error(`Qdrant collection "${sourceCollection}" has no vector configuration`);

  await client.createCollection(targetCollection, { vectors });

  let offset: string | number | undefined;
  do {
    const page = await client.scroll(sourceCollection, {
      offset,
      limit: 256,
      with_payload: true,
      with_vector: true,
    });
    const points = page.points;
    if (points.length > 0) {
      // Keep the SDK's own upsert point type so named/multi-vectors remain supported.
      type UpsertPoint = Extract<Parameters<typeof client.upsert>[1], { points: unknown }>["points"][number];
      const dense: UpsertPoint[] = points
        .filter((point) => point.vector != null)
        .map((point) => ({
          id: point.id,
          vector: point.vector!,
          payload: point.payload ?? undefined,
        }) as UpsertPoint);
      await client.upsert(targetCollection, {
        wait: true,
        points: dense,
      });
    }
    offset =
      typeof page.next_page_offset === "string" || typeof page.next_page_offset === "number"
        ? page.next_page_offset
        : undefined;
  } while (offset != null);

  // The snapshot is a byte copy: queries against it must use the source's model.
  await copyCollectionEmbedding(sourceCollection, targetCollection);
}

// ── Per-chunk operations (for Chunk Viewer UI) ──────────────────────────────

export type KbChunk = {
  pointId:          string;
  chunkIndex:       number;
  chunk:            string;
  uploadedAt:       string;
  title:            string;
  originalFilename: string;
  documentId:       string;
};

function qdrantErrorMessage(err: unknown): string {
  const e = err as { message?: unknown; status?: unknown; data?: unknown };
  const parts = [typeof e.message === "string" ? e.message : String(err)];
  if (typeof e.status === "number") parts.push(`HTTP ${e.status}`);
  if (e.data != null) {
    try { parts.push(JSON.stringify(e.data)); } catch { /* ignore non-serializable data */ }
  }
  return parts.join(" | ");
}

/** Ensure Qdrant can execute the documentId payload filter. */
// Memoised per process instance: once a collection's documentId index has
// been ensured, skip the Qdrant createPayloadIndex round trip on every
// subsequent chunk read/write. The previous behaviour issued the (wait:true)
// index-creation call on EVERY request — a synchronous Qdrant round trip per
// chunk listing that also raced concurrent index builds and surfaced as
// intermittent 502 CHUNKS_READ_FAILED responses.
const ensuredDocumentIdIndex = new Set<string>();
const documentIdIndexInFlight = new Map<string, Promise<void>>();

export async function ensureDocumentIdIndex(collectionName: string): Promise<void> {
  if (ensuredDocumentIdIndex.has(collectionName)) return;
  const inFlight = documentIdIndexInFlight.get(collectionName);
  if (inFlight) return inFlight;

  const task = (async () => {
    const client = getQdrantClient();
    try {
      await client.createPayloadIndex(collectionName, {
        field_name: "documentId",
        field_schema: "keyword",
        wait: true,
      });
    } catch (err) {
      const message = qdrantErrorMessage(err).toLowerCase();
      if (!message.includes("already exists") && !message.includes("already exist")) {
        throw new Error(
          `[qdrant] failed to ensure documentId payload index for collection="${collectionName}": ${qdrantErrorMessage(err)}`,
        );
      }
    } finally {
      documentIdIndexInFlight.delete(collectionName);
    }
    ensuredDocumentIdIndex.add(collectionName);
  })();

  documentIdIndexInFlight.set(collectionName, task);
  return task;
}


/**
 * Scroll all chunks for a single document out of Qdrant (no vectors).
 * Returns chunks sorted by chunkIndex.
 */
export async function listDocumentChunks(
  collectionName: string,
  documentId: string
): Promise<KbChunk[]> {
  const client = getQdrantClient();
  const chunks: KbChunk[] = [];
  await ensureDocumentIdIndex(collectionName);
  let offset: string | number | Record<string, unknown> | null | undefined = undefined;

  do {
    let result;
    try {
      result = await client.scroll(collectionName, {
        filter: { must: [{ key: "documentId", match: { value: documentId } }] },
        limit: 100,
        ...(offset !== undefined ? { offset } : {}),
        with_payload: true,
        with_vector: false,
      });
    } catch (err) {
      throw new Error(
        `[qdrant] failed to list chunks for collection="${collectionName}" documentId="${documentId}": ${qdrantErrorMessage(err)}`,
      );
    }

    for (const point of result.points) {
      const p = point.payload as Record<string, unknown>;
      chunks.push({
        pointId:          String(point.id),
        chunkIndex:       Number(p.chunkIndex ?? 0),
        chunk:            String(p.chunk ?? ""),
        uploadedAt:       String(p.uploadedAt ?? ""),
        title:            String(p.title ?? ""),
        originalFilename: String(p.originalFilename ?? ""),
        documentId:       String(p.documentId ?? documentId),
      });
    }

    offset = result.next_page_offset ?? null;
  } while (offset !== null && offset !== undefined);

  return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
}

/** Delete a single Qdrant point by its UUID point ID. */
export async function deleteChunk(
  collectionName: string,
  pointId: string
): Promise<void> {
  const client = getQdrantClient();
  await client.delete(collectionName, { wait: true, points: [pointId] });
  const kbId = (await getCollectionEmbedding(collectionName).catch(() => null))?.kbId;
  await dualWrite(kbId, collectionName, async (job) => {
    await client.delete(job.targetCollection, { wait: true, points: [pointId] });
  });
}

/**
 * Re-embed updated text and upsert back with the same pointId.
 * Preserves chunkIndex and all other metadata.
 */
export async function updateChunk(
  collectionName: string,
  pointId: string,
  newText: string,
  chunkIndex: number,
  meta: KbChunkMeta
): Promise<void> {
  const { config: providerConfig } = await resolveWriteEmbedding(meta.kbId, collectionName);
  const embedding = await embedWithRetry(newText, providerConfig);

  const client = getQdrantClient();
  const payload = {
    kbId:             meta.kbId,
    documentId:       meta.documentId,
    title:            meta.title,
    originalFilename: meta.originalFilename,
    chunk:            newText,
    chunkIndex,
    uploadedAt:       new Date().toISOString(),
  };
  await client.upsert(collectionName, {
    wait: true,
    points: [{ id: pointId, vector: embedding, payload }],
  });
  await dualWrite(meta.kbId, collectionName, async (job) => {
    const next = await embedWithRetry(newText, providerConfigFor(job));
    await client.upsert(job.targetCollection, { wait: true, points: [{ id: pointId, vector: next, payload }] });
  });
}

/**
 * Embed a new chunk text and insert it as a new Qdrant point.
 * Returns the generated pointId (UUID).
 */
export async function addChunk(
  collectionName: string,
  text: string,
  chunkIndex: number,
  meta: KbChunkMeta
): Promise<string> {
  const { config: providerConfig } = await resolveWriteEmbedding(meta.kbId, collectionName);
  const embedding = await embedWithRetry(text, providerConfig);

  const client = getQdrantClient();
  const pointId = randomUUID();
  const payload = {
    kbId:             meta.kbId,
    documentId:       meta.documentId,
    title:            meta.title,
    originalFilename: meta.originalFilename,
    chunk:            text,
    chunkIndex,
    uploadedAt:       new Date().toISOString(),
  };

  await client.upsert(collectionName, {
    wait: true,
    points: [{ id: pointId, vector: embedding, payload }],
  });
  await dualWrite(meta.kbId, collectionName, async (job) => {
    const next = await embedWithRetry(text, providerConfigFor(job));
    await client.upsert(job.targetCollection, { wait: true, points: [{ id: pointId, vector: next, payload }] });
  });

  return pointId;
}

/**
 * Delete all Qdrant points belonging to a specific document.
 * Called when a document is deleted from the DB.
 */
export async function deleteDocumentChunks(
  collectionName: string,
  documentId: string
): Promise<void> {
  const client = getQdrantClient();
  try {
    await ensureDocumentIdIndex(collectionName);
    const filter = { must: [{ key: "documentId", match: { value: documentId } }] };
    await client.delete(collectionName, { wait: true, filter });
    console.log(`[vs-kb] deleted chunks for documentId="${documentId}" from "${collectionName}"`);
    const kbId = (await getCollectionEmbedding(collectionName).catch(() => null))?.kbId;
    await dualWrite(kbId, collectionName, async (job) => {
      await ensureDocumentIdIndex(job.targetCollection);
      await client.delete(job.targetCollection, { wait: true, filter });
    });
  } catch (err) {
    console.warn(`[vs-kb] could not delete chunks for documentId=${documentId}:`, (err as Error).message);
  }
}
