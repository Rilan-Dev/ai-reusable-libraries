/**
 * src/modules/knowledge-bases/core/reindex.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-index a knowledge base with another embedding model — the ElevenLabs
 * "compute RAG index" flow on Clara's own Qdrant:
 *
 *   start    → a NEW collection is created for the target model and a job row
 *              records the source, target, cursor and progress
 *   advance  → pages of the live collection are scrolled, their stored chunk
 *              text is re-embedded with the target model and upserted with the
 *              same point ids and payloads (no re-parsing or re-scraping)
 *   swap     → when the cursor is exhausted the KB points at the new
 *              collection in one transaction; the old one is kept (retired)
 *              so in-flight reads and published versions keep working
 *
 * The live collection keeps serving throughout. New uploads during a job are
 * mirrored into the target by vector-store-kb (dual write). Jobs are
 * resumable and lease-protected, so any number of workers can advance them:
 * the status poll from the UI, the VPS background poller and the cron route.
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "@/lib/db";
import { ensureCollectionExists, getQdrantClient } from "@/modules/admin/core/vector-store";
import { embedBatches, ensureDocumentIdIndex } from "@/modules/admin/core/vector-store-kb";
import {
  ensureRuntimeSettings,
  forgetCollection,
  getActiveReindexJob,
  getCollectionEmbedding,
  getKbIndexContext,
  getMultilingualAvailability,
  providerConfigFor,
  registerCollectionEmbedding,
  resolveWriteEmbedding,
  setCollectionRole,
  targetForIndex,
  toJob,
  type EmbeddingIndexKind,
  type ReindexJob,
} from "./embedding-index";

const PAGE_SIZE = (() => {
  const value = Number(process.env.REINDEX_PAGE_SIZE);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 256) : 64;
})();
const LEASE_MS = 60_000;
/** Retired collections stay at least this long (stale caches may still read them). */
const RETIRED_GRACE_MINUTES = 10;

export class ReindexError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

type Row = Record<string, unknown>;

function targetCollectionName(source: string, index: EmbeddingIndexKind): string {
  const base = source.replace(/__(ml|std)_[a-z0-9]+$/i, "").slice(0, 200);
  return `${base}__${index === "multilingual" ? "ml" : "std"}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

/** Start re-indexing a KB into `index`. One active job per KB. */
export async function startReindex(input: {
  kbId: string;
  index: EmbeddingIndexKind;
  userId?: string | null;
}): Promise<ReindexJob> {
  const context = await getKbIndexContext(input.kbId);
  if (!context) throw new ReindexError("Knowledge base not found.", 404, "KB_NOT_FOUND");

  if (input.index === "multilingual") {
    const availability = await getMultilingualAvailability(context.orgId);
    if (!availability.available) {
      throw new ReindexError(availability.reason ?? "The multilingual index is not available.", 403, "MULTILINGUAL_UNAVAILABLE");
    }
  }
  if (await getActiveReindexJob(input.kbId)) {
    throw new ReindexError("A re-index is already running for this knowledge base.", 409, "REINDEX_RUNNING");
  }

  // Make sure the live collection is registered (adopts a legacy collection).
  const { entry: current } = await resolveWriteEmbedding(input.kbId, context.collection);
  const target = await targetForIndex(input.kbId, input.index);
  if (current.provider === target.provider && current.model === target.model && current.dimension === target.dimension) {
    // Already on this model: just record the choice.
    await query("UPDATE knowledge_bases SET embedding_index = $2, updated_at = now() WHERE id = $1", [
      input.kbId,
      input.index,
    ]);
    throw new ReindexError("This knowledge base already uses that embedding model.", 409, "ALREADY_INDEXED");
  }

  const client = getQdrantClient();
  let pointsTotal = 0;
  try {
    pointsTotal = (await client.count(context.collection, { exact: true }))?.count ?? 0;
  } catch {
    pointsTotal = 0; // an empty KB has no collection yet — the swap is instant
  }

  const targetCollection = targetCollectionName(context.collection, input.index);
  await ensureCollectionExists(targetCollection, { vectorSize: target.dimension });
  await ensureDocumentIdIndex(targetCollection);
  await registerCollectionEmbedding({
    collectionName: targetCollection,
    kbId: input.kbId,
    index: input.index,
    provider: target.provider,
    model: target.model,
    dimension: target.dimension,
    role: "building",
  });

  let row: Row | null;
  try {
    row = await queryOne<Row>(
      `INSERT INTO kb_reindex_jobs
         (kb_id, source_collection, target_collection, target_index, embedding_provider, embedding_model,
          dimension, status, points_total, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', $8, $9)
       RETURNING *`,
      [input.kbId, context.collection, targetCollection, input.index, target.provider, target.model,
        target.dimension, pointsTotal, input.userId ?? null],
    );
  } catch (error) {
    // Lost a race with another start: drop the collection we just created.
    await client.deleteCollection(targetCollection).catch(() => {});
    await forgetCollection(targetCollection).catch(() => {});
    if (/kb_reindex_jobs_active_uidx|duplicate key/i.test((error as Error).message)) {
      throw new ReindexError("A re-index is already running for this knowledge base.", 409, "REINDEX_RUNNING");
    }
    throw error;
  }
  await query("UPDATE knowledge_bases SET embedding_index = $2, updated_at = now() WHERE id = $1", [
    input.kbId,
    input.index,
  ]);
  return toJob(row!);
}

/** Claim the job for this worker, or null when another worker holds it. */
async function claim(jobId: string): Promise<ReindexJob | null> {
  const row = await queryOne<Row>(
    `UPDATE kb_reindex_jobs
        SET status = 'running', lease_until = now() + ($2::int * interval '1 millisecond'), updated_at = now()
      WHERE id = $1 AND status IN ('queued', 'running')
        AND (lease_until IS NULL OR lease_until < now())
      RETURNING *`,
    [jobId, LEASE_MS],
  );
  return row ? toJob(row) : null;
}

async function getJob(jobId: string): Promise<ReindexJob | null> {
  const row = await queryOne<Row>("SELECT * FROM kb_reindex_jobs WHERE id = $1", [jobId]);
  return row ? toJob(row) : null;
}

/**
 * Advance a job for up to `budgetMs`. Safe to call from anywhere, any number
 * of times: only the lease holder does work. Returns the job's state.
 */
export async function advanceReindexJob(jobId: string, budgetMs = 8_000): Promise<ReindexJob | null> {
  await ensureRuntimeSettings();
  const claimed = await claim(jobId);
  if (!claimed) return getJob(jobId);

  const started = Date.now();
  const client = getQdrantClient();
  const context = await getKbIndexContext(claimed.kbId);
  const metering = { orgId: context?.orgId ?? null, kbId: claimed.kbId, documentId: null };
  const targetConfig = providerConfigFor(claimed);
  let cursor: string | number | null = claimed.cursor;
  let done = 0;

  try {
    let exhausted = claimed.pointsTotal === 0 && cursor == null
      ? !(await client.collectionExists(claimed.sourceCollection).then((r) => r.exists).catch(() => false))
      : false;

    while (!exhausted && Date.now() - started < budgetMs) {
      const page = await client.scroll(claimed.sourceCollection, {
        limit: PAGE_SIZE,
        ...(cursor != null ? { offset: cursor } : {}),
        with_payload: true,
        with_vector: false,
      });
      const points = page.points.filter((point) => {
        const chunk = (point.payload as Record<string, unknown> | null)?.chunk;
        return typeof chunk === "string" && chunk.trim().length > 0;
      });
      if (points.length > 0) {
        const texts = points.map((point) => String((point.payload as Record<string, unknown>).chunk));
        const vectors = await embedBatches(texts, targetConfig, metering);
        await client.upsert(claimed.targetCollection, {
          wait: true,
          points: points.map((point, index) => ({
            id: point.id,
            vector: vectors[index]!,
            payload: (point.payload ?? {}) as Record<string, unknown>,
          })),
        });
      }
      done += page.points.length;
      const next = page.next_page_offset;
      cursor = typeof next === "string" || typeof next === "number" ? next : null;
      exhausted = cursor == null;
      await query(
        `UPDATE kb_reindex_jobs
            SET cursor = $2, points_done = points_done + $3,
                lease_until = now() + ($4::int * interval '1 millisecond'), updated_at = now()
          WHERE id = $1`,
        [claimed.id, cursor == null ? null : JSON.stringify({ offset: cursor }), page.points.length, LEASE_MS],
      );
    }

    if (exhausted) return await swap(claimed);
    await query("UPDATE kb_reindex_jobs SET lease_until = NULL WHERE id = $1", [claimed.id]);
    return getJob(claimed.id);
  } catch (error) {
    const message = (error as Error).message.slice(0, 1000);
    console.error(`[reindex] job ${claimed.id} failed after ${done} points:`, message);
    await query(
      `UPDATE kb_reindex_jobs SET status = 'failed', error_message = $2, lease_until = NULL, updated_at = now()
        WHERE id = $1`,
      [claimed.id, message],
    );
    return getJob(claimed.id);
  }
}

async function swap(job: ReindexJob): Promise<ReindexJob | null> {
  await withTransaction(async (tx) => {
    const updated = await tx.query(
      `UPDATE knowledge_bases SET qdrant_collection = $2, embedding_index = $3, updated_at = now()
        WHERE id = $1 AND qdrant_collection = $4`,
      [job.kbId, job.targetCollection, job.targetIndex, job.sourceCollection],
    );
    if (updated.rowCount === 0) {
      throw new Error("The knowledge base moved to another collection during the re-index.");
    }
    await tx.query(
      "UPDATE kb_vector_collections SET role = 'retired', updated_at = now() WHERE collection_name = $1",
      [job.sourceCollection],
    );
    await tx.query(
      "UPDATE kb_vector_collections SET role = 'live', updated_at = now() WHERE collection_name = $1",
      [job.targetCollection],
    );
    await tx.query(
      `UPDATE kb_reindex_jobs
          SET status = 'completed', completed_at = now(), lease_until = NULL, cursor = NULL, updated_at = now()
        WHERE id = $1`,
      [job.id],
    );
  });
  await Promise.all([
    setCollectionRole(job.sourceCollection, "retired").catch(() => {}),
    setCollectionRole(job.targetCollection, "live").catch(() => {}),
  ]);
  console.info(`[reindex] kb=${job.kbId} now on "${job.targetCollection}" (${job.model})`);
  return getJob(job.id);
}

/** Resume a failed job from its cursor. */
export async function retryReindexJob(kbId: string): Promise<ReindexJob> {
  const row = await queryOne<Row>(
    `UPDATE kb_reindex_jobs SET status = 'queued', error_message = NULL, lease_until = NULL, updated_at = now()
      WHERE id = (SELECT id FROM kb_reindex_jobs WHERE kb_id = $1 AND status = 'failed' ORDER BY created_at DESC LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM kb_reindex_jobs WHERE kb_id = $1 AND status IN ('queued','running'))
      RETURNING *`,
    [kbId],
  );
  if (!row) throw new ReindexError("There is no failed re-index to resume.", 409, "NOTHING_TO_RESUME");
  return toJob(row);
}

/** Cancel the active job and drop its half-built collection. */
export async function cancelReindex(kbId: string): Promise<ReindexJob | null> {
  const job = await getActiveReindexJob(kbId);
  if (!job) return null;
  await query(
    `UPDATE kb_reindex_jobs SET status = 'cancelled', lease_until = NULL, updated_at = now(), completed_at = now()
      WHERE id = $1`,
    [job.id],
  );
  await getQdrantClient().deleteCollection(job.targetCollection).catch(() => {});
  await forgetCollection(job.targetCollection).catch(() => {});
  const source = await getCollectionEmbedding(job.sourceCollection).catch(() => null);
  await query("UPDATE knowledge_bases SET embedding_index = $2, updated_at = now() WHERE id = $1", [
    kbId,
    source?.index ?? "standard",
  ]);
  return getJob(job.id);
}

/**
 * Delete this KB's retired collections (after the grace period) that no
 * published version still uses. Frees vector storage once the new index is
 * verified.
 */
export async function deleteRetiredIndexes(kbId: string): Promise<string[]> {
  const rows = await query<{ collection_name: string }>(
    `SELECT c.collection_name
       FROM kb_vector_collections c
      WHERE c.kb_id = $1 AND c.role = 'retired'
        AND c.updated_at < now() - ($2::int * interval '1 minute')
        AND NOT EXISTS (SELECT 1 FROM knowledge_bases kb WHERE kb.qdrant_collection = c.collection_name)
        AND NOT EXISTS (SELECT 1 FROM agent_deployment_kb_snapshots s WHERE s.collection_name = c.collection_name)`,
    [kbId, RETIRED_GRACE_MINUTES],
  );
  const client = getQdrantClient();
  const deleted: string[] = [];
  for (const row of rows) {
    try {
      await client.deleteCollection(row.collection_name);
    } catch (error) {
      if (!/not found/i.test((error as Error).message)) throw error;
    }
    await forgetCollection(row.collection_name);
    deleted.push(row.collection_name);
  }
  return deleted;
}

/**
 * Advance every runnable job a little (background workers). Returns how many
 * jobs were touched.
 */
export async function advanceAllReindexJobs(budgetMs = 20_000): Promise<number> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM kb_reindex_jobs
      WHERE status IN ('queued', 'running') AND (lease_until IS NULL OR lease_until < now())
      ORDER BY created_at ASC LIMIT 5`,
  );
  const deadline = Date.now() + budgetMs;
  for (const row of rows) {
    const remaining = deadline - Date.now();
    if (remaining < 1_000) break;
    await advanceReindexJob(row.id, remaining);
  }
  return rows.length;
}
