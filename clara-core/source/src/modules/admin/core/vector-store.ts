import { randomUUID } from "node:crypto";

import { QdrantClient } from "@qdrant/js-client-rest";

import { ProviderFactory } from "@/modules/ai-core/factory";

// ── Batch-embedding configuration ─────────────────────────────────────────────
//
// Chunks are processed in sequential batches of EMBED_BATCH_SIZE with a brief
// inter-batch pause. If a 429 is received, exponential backoff is applied up
// to EMBED_MAX_RETRIES, respecting Retry-After / x-ratelimit-reset-requests.
const EMBED_BATCH_SIZE: number = (() => {
  const v = Number(process.env.EMBED_BATCH_SIZE ?? "20");
  return Number.isFinite(v) && v > 0 ? v : 20;
})();

const EMBED_BATCH_DELAY_MS: number = (() => {
  const v = Number(process.env.EMBED_BATCH_DELAY ?? "300");
  return Number.isFinite(v) && v >= 0 ? v : 300;
})();

const EMBED_MAX_RETRIES: number = (() => {
  const v = Number(process.env.EMBED_MAX_RETRIES ?? "4");
  return Number.isFinite(v) && v >= 0 ? v : 4;
})();

// ── Upsert batch size ─────────────────────────────────────────────────────────
//
// FIX: All N points were previously sent in a single client.upsert() call.
// For a 3631-chunk document at 1536 dimensions, the serialised JSON body is
// ~86 MB — above Qdrant Cloud's effective per-request limit. Qdrant returns
// 400 Bad Request with a body that reads "content length limit exceeded" or
// "payload size too large", but the error.data field was logged as [Object]
// so the actual message was invisible.
//
// Fix: split points into sequential batches of UPSERT_BATCH_SIZE (default 200).
// 200 × 1536 dims × 4 bytes/float ≈ 1.2 MB per batch — well within limits.
const UPSERT_BATCH_SIZE: number = (() => {
  const v = Number(process.env.UPSERT_BATCH_SIZE ?? "200");
  return Number.isFinite(v) && v > 0 ? v : 200;
})();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDefaultEmbeddingDimension(): number {
  try {
    return ProviderFactory.getProvider().getEmbeddingDimension();
  } catch {
    return 1536;
  }
}

// ── Qdrant error helper ───────────────────────────────────────────────────────
//
// FIX: The Qdrant JS client throws an object with a `data` field that contains
// the server's error body. Node.js console.error() prints nested objects as
// "[Object]" beyond depth 2. The previous code let this propagate to the top-
// level handler which printed "Error: Bad Request" with no context.
//
// This helper extracts and stringifies the data field so the actual Qdrant
// error message (e.g. "Wrong vector size", "content length limit exceeded")
// is always visible in server logs.
function qdrantErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & { data?: unknown; status?: number };
    const dataStr = e.data
      ? ` | body: ${JSON.stringify(e.data)}`
      : "";
    const statusStr = e.status ? ` (HTTP ${e.status})` : "";
    return `${e.message}${statusStr}${dataStr}`;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

let qdrantClient: QdrantClient | undefined;

export function getQdrantClient(): QdrantClient {
  if (qdrantClient) return qdrantClient;

  const url = process.env.QDRANT_URL;
  if (!url) {
    throw new Error(
      "QDRANT_URL is not set. Provide your Qdrant endpoint in the environment."
    );
  }

  const normalisedUrl = url.replace(/\/+$/, "");
  const rawKey = process.env.QDRANT_API_KEY?.trim();
  const ignoreKeys = new Set([
    "",
    "none",
    "null",
    "undefined",
    "0",
    "false",
    "demo",
    "example",
    "1234567890",
  ]);
  const apiKey =
    rawKey && !ignoreKeys.has(rawKey.toLowerCase()) ? rawKey : undefined;

  // checkCompatibility: false — skips the client/server version handshake.
  //
  // The Qdrant JS client performs a version-compatibility check on every new
  // connection. If the installed client (1.15.1) and the server (1.17.0)
  // differ by more than one minor version the client throws before any
  // request is sent. With checkCompatibility:false the check is skipped;
  // actual API incompatibilities surface as HTTP errors with clear messages.
  qdrantClient = new QdrantClient({ url: normalisedUrl, apiKey, checkCompatibility: false });
  return qdrantClient;
}

export type RetrievedDocument = {
  id: string;
  title: string;
  snippet: string;
  url?: string;
  score: number;
  payload?: Record<string, unknown>;
};

export type DocumentChunk = {
  id?: string;
  text: string;
  title?: string;
  url?: string;
  metadata?: Record<string, unknown>;
};

// ── ensureCollectionExists ────────────────────────────────────────────────────
//
// FIX: The previous implementation called getCollection() and returned early
// if the collection already existed, without checking whether its configured
// vector dimension matched the current embedding model.
//
// A stale collection from a previous ingest run (e.g. created with 768-dim
// embeddings before switching to text-embedding-3-small at 1536 dims) would
// accept the create call silently, then fail every upsert with Qdrant's
// "Wrong vector size" 400 error — which was previously hidden behind [Object].
//
// Fix: fetch the collection info and compare the stored vector size to the
// expected size. Existing tenant collections are never deleted automatically on mismatch.

export async function ensureCollectionExists(
  collectionName: string,
  options?: { vectorSize?: number; distance?: "Cosine" | "Dot" | "Euclid" }
): Promise<void> {
  const client = getQdrantClient();
  const expectedSize = options?.vectorSize ?? getDefaultEmbeddingDimension();
  const expectedDistance = options?.distance ?? "Cosine";

  let existingSize: number | null = null;
  try {
    const info = await client.getCollection(collectionName);
    // The vectors config lives at info.config.params.vectors.
    // It can be a single VectorsConfig object or a named-vector map.
    const params = (info as unknown as {
      config?: { params?: { vectors?: { size?: number } | Record<string, { size?: number }> } };
    }).config?.params?.vectors;

    if (params && typeof params === "object" && "size" in params) {
      existingSize = (params as { size?: number }).size ?? null;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/not found/i.test(msg)) {
      throw new Error(`[vector-store] getCollection failed: ${qdrantErrorMessage(err)}`);
    }
    // Collection does not exist — fall through to create it.
  }

  if (existingSize !== null) {
    if (existingSize === expectedSize) {
      // Collection exists with the right dimensions — nothing to do.
      return;
    }

    // Never delete a tenant collection automatically. A dimension mismatch
    // means the collection was created for a different embedding model; deleting
    // it here would silently destroy every document vector in that KB.
    // The caller must explicitly reindex/rebuild the collection.
    throw new Error(
      `[vector-store] Qdrant collection "${collectionName}" has vector size ${existingSize}, ` +
      `but the current embedding model requires ${expectedSize}. ` +
      `Refusing to delete the existing collection; explicitly reindex/rebuild this KB.`
    );
  }

  // Create collection with correct dimensions.
  try {
    await client.createCollection(collectionName, {
      vectors: {
        size: expectedSize,
        distance: expectedDistance,
      },
    });
    console.log(
      `[vector-store] created collection "${collectionName}" ` +
      `(size=${expectedSize}, distance=${expectedDistance})`
    );
  } catch (createErr) {
    throw new Error(
      `[vector-store] failed to create collection "${collectionName}": ` +
      qdrantErrorMessage(createErr)
    );
  }
}

async function embedText(text: string): Promise<number[]> {
  return ProviderFactory.getProvider().embedText(text);
}

export async function embedQuery(text: string): Promise<number[]> {
  return embedText(text);
}

// ── embedTextWithRetry ────────────────────────────────────────────────────────
// Wraps embedText with exponential backoff on rate-limit (429) errors.

async function embedTextWithRetry(text: string, attempt = 0): Promise<number[]> {
  try {
    return await embedText(text);
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    const status =
      typeof e?.status === "number"
        ? e.status
        : typeof e?.statusCode === "number"
        ? e.statusCode
        : e?.message && String(e.message).includes("429")
        ? 429
        : 0;

    if (status === 429 && attempt < EMBED_MAX_RETRIES) {
      const headers = e?.headers as Record<string, string> | undefined;
      const retryAfterHeader =
        headers?.["retry-after"] ??
        headers?.["x-ratelimit-reset-requests"] ??
        null;
      const retryAfterMs = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : Math.min(1_000 * 2 ** attempt, 30_000);

      console.warn(
        `[vector-store] rate-limited on embedText, ` +
        `retrying in ${retryAfterMs}ms ` +
        `(attempt ${attempt + 1}/${EMBED_MAX_RETRIES})`
      );
      await sleep(retryAfterMs);
      return embedTextWithRetry(text, attempt + 1);
    }
    throw err;
  }
}

// ── embedAllInBatches ─────────────────────────────────────────────────────────
// Sequential batches of EMBED_BATCH_SIZE with a brief inter-batch pause.

async function embedAllInBatches(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  const totalBatches = Math.ceil(texts.length / EMBED_BATCH_SIZE);

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const batchNum = Math.floor(i / EMBED_BATCH_SIZE) + 1;

    console.log(
      `[vector-store] embedding batch ${batchNum}/${totalBatches} ` +
      `(${batch.length} chunk${batch.length === 1 ? "" : "s"})`
    );

    const embeddings = await Promise.all(
      batch.map((text) => embedTextWithRetry(text))
    );
    results.push(...embeddings);

    if (i + EMBED_BATCH_SIZE < texts.length && EMBED_BATCH_DELAY_MS > 0) {
      await sleep(EMBED_BATCH_DELAY_MS);
    }
  }

  return results;
}

// ── upsertDocuments ───────────────────────────────────────────────────────────

export async function upsertDocuments(
  collectionName: string,
  chunks: DocumentChunk[]
): Promise<void> {
  if (chunks.length === 0) return;

  const client = getQdrantClient();
  await ensureCollectionExists(collectionName);

  const embeddings = await embedAllInBatches(chunks.map((c) => c.text));

  // Build all points first so we can slice them into upsert batches.
  const points = chunks.map((chunk, index) => ({
    id: chunk.id ?? randomUUID(),
    vector: embeddings[index]!,
    payload: {
      title: chunk.title ?? "Untitled",
      chunk: chunk.text,
      url: chunk.url ?? null,
      ...chunk.metadata,
    },
  }));

  // FIX: Batch the upsert into groups of UPSERT_BATCH_SIZE (default 200).
  //
  // Sending all 3631 points in one request serialises to ~86 MB of JSON at
  // 1536 dimensions, exceeding Qdrant Cloud's effective request-body limit.
  // Qdrant returns 400 Bad Request in that case; the previous code passed the
  // entire array in one call and logged the error as "Bad Request [Object]"
  // with no details. Batching keeps each request under ~1.2 MB.
  const totalBatches = Math.ceil(points.length / UPSERT_BATCH_SIZE);
  for (let i = 0; i < points.length; i += UPSERT_BATCH_SIZE) {
    const batch = points.slice(i, i + UPSERT_BATCH_SIZE);
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1;

    console.log(
      `[vector-store] upserting batch ${batchNum}/${totalBatches} ` +
      `(${batch.length} point${batch.length === 1 ? "" : "s"}) ` +
      `into "${collectionName}"`
    );

    try {
      await client.upsert(collectionName, { wait: true, points: batch });
    } catch (err) {
      // Surface the full Qdrant error including the response body.
      throw new Error(
        `[vector-store] upsert batch ${batchNum}/${totalBatches} failed ` +
        `for collection "${collectionName}": ${qdrantErrorMessage(err)}`
      );
    }
  }

  console.log(
    `[vector-store] upserted ${points.length} points into "${collectionName}"`
  );
}

// ── searchSimilarDocuments ────────────────────────────────────────────────────

const SOURCE_FIELDS = [
  "title",
  "chunk",
  "url",
  "format",
  "sourceType",
  "filename",
  "order",
  "description",
  "retrievedAt",
  "length",
  "sourcePath",
  "originalFilename",
  "uploadedAt",
] as const;

function sanitisePayload(
  payload: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!payload) return {};
  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    if (SOURCE_FIELDS.includes(key as (typeof SOURCE_FIELDS)[number])) {
      cleaned[key] = payload[key];
    }
  }
  return cleaned;
}

export async function searchSimilarDocuments(
  collectionName: string,
  embedding: number[],
  topK = 4
): Promise<RetrievedDocument[]> {
  const client = getQdrantClient();
  console.log(
    `[vector-store] searching collection="${collectionName}" topK=${topK}`
  );

  let results = await client.search(collectionName, {
    vector: embedding,
    limit: topK,
    with_payload: true,
    score_threshold: 0.2,
  });

  if (!Array.isArray(results) || results.length === 0) {
    results = await client.search(collectionName, {
      vector: embedding,
      limit: topK,
      with_payload: true,
    });
  }

  console.log(
    `[vector-store] retrieved ${Array.isArray(results) ? results.length : 0} hits`
  );

  type SearchResult = {
    id?: string | number;
    payload?: Record<string, unknown>;
    score?: number;
  };

  return (results as SearchResult[]).map((result) => {
    const payload = sanitisePayload(result.payload);
    return {
      id: String(result.id ?? randomUUID()),
      title: (payload.title as string) ?? "Untitled",
      snippet: (payload.chunk as string) ?? "",
      url: (payload.url as string | undefined) ?? undefined,
      score: result.score ?? 0,
      payload,
    };
  });
}
