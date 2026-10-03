/**
 * src/modules/knowledge-bases/core/documents-db.ts
 * PostgreSQL queries for documents and ingest_jobs tables.
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, execute, pool } from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DocumentStatus = "pending" | "processing" | "ready" | "failed";
export type JobStatus      = "pending" | "running" | "done" | "failed";

export type KbDocument = {
  id:               string;
  kbId:             string;
  title:            string;
  originalFilename: string;
  sourceType:       "upload" | "url" | "api";
  createdByScrapeSessionId: string | null;
  mimeType:         string | null;
  fileSize:         number | null;
  chunkCount:       number | null;
  status:           DocumentStatus;
  errorMessage:     string | null;
  uploadedBy:       string | null;
  createdAt:        string;
  updatedAt:        string;
};

export type IngestJob = {
  id:           string;
  documentId:   string;
  kbId:         string;
  status:       JobStatus;
  attempts:     number;
  maxAttempts:  number;
  errorMessage: string | null;
  scheduledAt:  string;
  startedAt:    string | null;
  completedAt:  string | null;
  createdAt:    string;
};

export type IngestJobWithPayload = IngestJob & {
  filePayload: { base64: string; mimeType: string; filename: string } | null;
};

export type SessionIngestProgress = {
  totalDocs: number;
  pendingDocs: number;
  processingDocs: number;
  readyDocs: number;
  failedDocs: number;
};

// ── Row mappers ───────────────────────────────────────────────────────────────

function toDocument(row: Record<string, unknown>): KbDocument {
  return {
    id:               String(row.id),
    kbId:             String(row.kb_id),
    title:            String(row.title),
    originalFilename: String(row.original_filename),
    sourceType:       (row.source_type as KbDocument["sourceType"]) ?? "upload",
    createdByScrapeSessionId: row.created_by_scrape_session_id != null
      ? String(row.created_by_scrape_session_id)
      : null,
    mimeType:         row.mime_type != null ? String(row.mime_type) : null,
    fileSize:         row.file_size != null ? Number(row.file_size) : null,
    chunkCount:       row.chunk_count != null ? Number(row.chunk_count) : null,
    status:           (row.status as DocumentStatus) ?? "pending",
    errorMessage:     row.error_message != null ? String(row.error_message) : null,
    uploadedBy:       row.uploaded_by != null ? String(row.uploaded_by) : null,
    createdAt:        String(row.created_at),
    updatedAt:        String(row.updated_at),
  };
}

function toJob(row: Record<string, unknown>): IngestJob {
  return {
    id:           String(row.id),
    documentId:   String(row.document_id),
    kbId:         String(row.kb_id),
    status:       (row.status as JobStatus) ?? "pending",
    attempts:     Number(row.attempts),
    maxAttempts:  Number(row.max_attempts),
    errorMessage: row.error_message != null ? String(row.error_message) : null,
    scheduledAt:  String(row.scheduled_at),
    startedAt:    row.started_at != null ? String(row.started_at) : null,
    completedAt:  row.completed_at != null ? String(row.completed_at) : null,
    createdAt:    String(row.created_at),
  };
}

// ── Documents CRUD ────────────────────────────────────────────────────────────

export async function createDocument(input: {
  kbId:             string;
  title:            string;
  originalFilename: string;
  sourceType?:      KbDocument["sourceType"];
  createdByScrapeSessionId?: string;
  mimeType?:        string;
  fileSize?:        number;
  uploadedBy?:      string;
}): Promise<KbDocument> {
  const id = randomUUID();
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO documents (
       id, kb_id, title, original_filename, source_type,
       created_by_scrape_session_id, mime_type, file_size, uploaded_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [id, input.kbId, input.title, input.originalFilename, input.sourceType ?? "upload",
     input.createdByScrapeSessionId ?? null, input.mimeType ?? null,
     input.fileSize ?? null, input.uploadedBy ?? null]
  );
  if (!row) throw new Error("Failed to create document");
  return toDocument(row);
}

export async function listDocuments(kbId: string): Promise<KbDocument[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM documents WHERE kb_id = $1 ORDER BY created_at DESC",
    [kbId]
  );
  return rows.map(toDocument);
}

export async function getDocumentById(id: string): Promise<KbDocument | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM documents WHERE id = $1",
    [id]
  );
  return row ? toDocument(row) : null;
}

/**
 * Find an existing document in a KB by its source URL.
 * Used by the scrape worker to avoid creating duplicate documents when
 * the same URL is scraped in a later session.
 *
 * Source URLs are stored in `original_filename` for source_type='url' docs.
 * Scoped to kb_id so URLs shared across KBs don't collide.
 */
export async function findDocumentBySourceUrl(
  kbId: string,
  sourceUrl: string
): Promise<KbDocument | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM documents
     WHERE kb_id = $1
       AND original_filename = $2
       AND source_type = 'url'
     ORDER BY created_at DESC
     LIMIT 1`,
    [kbId, sourceUrl]
  );
  return row ? toDocument(row) : null;
}

/**
 * Reset a document back to pending so the ingest pipeline re-processes it.
 * Used when re-scraping a URL that previously failed or went stale.
 */
export async function refreshDocument(
  id: string,
  updates: { title?: string; fileSize?: number }
): Promise<void> {
  await execute(
    `UPDATE documents
     SET title         = COALESCE($1, title),
         file_size     = COALESCE($2, file_size),
         status        = 'pending',
         error_message = NULL,
         chunk_count   = NULL,
         updated_at    = now()
     WHERE id = $3`,
    [updates.title ?? null, updates.fileSize ?? null, id]
  );
}

export async function updateDocumentStatus(
  id: string,
  status: DocumentStatus,
  extra?: { chunkCount?: number; errorMessage?: string }
): Promise<void> {
  await execute(
    `UPDATE documents
     SET status = $1,
         chunk_count   = COALESCE($2, chunk_count),
         error_message = $3
     WHERE id = $4`,
    [status, extra?.chunkCount ?? null, extra?.errorMessage ?? null, id]
  );
}

export async function deleteDocument(id: string): Promise<string | null> {
  const row = await queryOne<{ kb_id: string }>(
    "DELETE FROM documents WHERE id = $1 RETURNING kb_id",
    [id]
  );
  return row?.kb_id ?? null;
}

// ── Ingest Jobs ───────────────────────────────────────────────────────────────

export async function createIngestJob(
  documentId: string,
  kbId: string,
  filePayload: { base64: string; mimeType: string; filename: string }
): Promise<IngestJob> {
  const id = randomUUID();
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO ingest_jobs (id, document_id, kb_id, file_payload)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING *`,
    [id, documentId, kbId, JSON.stringify(filePayload)]
  );
  if (!row) throw new Error("Failed to create ingest job");
  return toJob(row);
}

/**
 * Atomically claim the next pending ingest job.
 * Uses SELECT FOR UPDATE SKIP LOCKED so multiple workers never pick the same job.
 */
export async function claimNextPendingJob(): Promise<IngestJobWithPayload | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query<Record<string, unknown>>(
      `SELECT * FROM ingest_jobs
       WHERE status = 'pending'
         AND attempts < max_attempts
         AND scheduled_at <= now()
       ORDER BY scheduled_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );

    const row = res.rows[0];
    if (!row) { await client.query("ROLLBACK"); return null; }

    await client.query(
      `UPDATE ingest_jobs
       SET status = 'running', started_at = now(), attempts = attempts + 1
       WHERE id = $1`,
      [row.id]
    );

    await client.query("COMMIT");

    const job = toJob({
      ...row,
      status:     "running",
      started_at: new Date().toISOString(),
      attempts:   Number(row.attempts) + 1,
    });
    const rawPayload = row.file_payload as { base64: string; mimeType: string; filename: string } | null;
    return { ...job, filePayload: rawPayload };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function claimPendingJobById(jobId: string): Promise<IngestJobWithPayload | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query<Record<string, unknown>>(
      `SELECT * FROM ingest_jobs
       WHERE id = $1
         AND attempts < max_attempts
         AND (
           (status = 'pending' AND scheduled_at <= now())
           OR (
             status = 'running'
             AND started_at < now() - INTERVAL '10 minutes'
           )
         )
       FOR UPDATE SKIP LOCKED`,
      [jobId]
    );

    const row = res.rows[0];
    if (!row) { await client.query("ROLLBACK"); return null; }

    await client.query(
      `UPDATE ingest_jobs
       SET status = 'running', started_at = now(), attempts = attempts + 1
       WHERE id = $1`,
      [row.id]
    );

    await client.query("COMMIT");

    const job = toJob({
      ...row,
      status: "running",
      started_at: new Date().toISOString(),
      attempts: Number(row.attempts) + 1,
    });
    const rawPayload = row.file_payload as { base64: string; mimeType: string; filename: string } | null;
    return { ...job, filePayload: rawPayload };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function markJobDone(jobId: string): Promise<void> {
  await execute(
    `UPDATE ingest_jobs
     SET status = 'done', completed_at = now(), file_payload = NULL
     WHERE id = $1`,
    [jobId]
  );
}

export async function markJobFailed(
  jobId: string,
  errorMessage: string,
  rescheduleDelay?: number
): Promise<void> {
  const delaySeconds = rescheduleDelay ?? 30;
  await execute(
    `UPDATE ingest_jobs
     SET status        = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
         error_message = $1,
         scheduled_at  = CASE WHEN attempts >= max_attempts
                              THEN scheduled_at
                              ELSE now() + ($2 || ' seconds')::interval END,
         completed_at  = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END
     WHERE id = $3`,
    [errorMessage, delaySeconds, jobId]
  );
}

export async function getDocumentJobStatus(documentId: string): Promise<IngestJobWithPayload | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM ingest_jobs WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1",
    [documentId]
  );
  if (!row) return null;
  const rawPayload = row.file_payload as { base64: string; mimeType: string; filename: string } | null;
  return { ...toJob(row), filePayload: rawPayload };
}

// ── Stale job / interrupted document recovery ─────────────────────────────────

/**
 * Reset ingest jobs that were claimed ('running') but never finished — e.g. the
 * container crashed or restarted mid-processing. Without this, a job stays
 * 'running' forever, its document stays 'processing', and the reprocess
 * endpoint rejects every retry with "Document is already processing".
 *
 * A job should never legitimately run longer than the route's maxDuration
 * (300s); we reset anything running longer than the stale window (default
 * 10 min) so it gets re-claimed by the poller.
 */
export async function resetStaleIngestJobs(staleMs = 10 * 60 * 1000): Promise<number> {
  const row = await queryOne<{ count: string | number }>(
    `WITH stale AS (
       UPDATE ingest_jobs
       SET status       = 'pending',
           error_message = COALESCE(error_message, '') ||
                            CASE WHEN error_message IS NULL OR error_message = ''
                                 THEN '' ELSE ' | ' END ||
                            'Recovered from interrupted run',
           scheduled_at  = now()
       WHERE status = 'running'
         AND started_at < now() - ($1 || ' milliseconds')::interval
       RETURNING 1
     )
     SELECT COUNT(*) AS count FROM stale`,
    [String(staleMs)]
  );
  const count = Number(row?.count ?? 0);
  if (count > 0) {
    console.log(`[ingest-recovery] reset ${count} stale running job(s) back to pending`);
  }
  return count;
}

/**
 * Mark documents stuck in 'processing' that have no pending/running job left
 * (e.g. every job finished while the status update was lost, or a recovered
 * job was cancelled) as failed so the UI shows a Retry button instead of an
 * eternal spinner.
 */
export async function failOrphanedProcessingDocuments(): Promise<number> {
  const row = await queryOne<{ count: string | number }>(
    `WITH orphaned AS (
       UPDATE documents d
       SET status        = 'failed',
           error_message = 'Processing was interrupted before completing. Retry to rebuild vectors.',
           updated_at    = now()
       WHERE d.status = 'processing'
         AND NOT EXISTS (
           SELECT 1 FROM ingest_jobs ij
           WHERE ij.document_id = d.id
             AND ij.status IN ('pending', 'running')
         )
       RETURNING 1
     )
     SELECT COUNT(*) AS count FROM orphaned`,
  );
  const count = Number(row?.count ?? 0);
  if (count > 0) {
    console.log(`[ingest-recovery] marked ${count} orphaned processing document(s) as failed`);
  }
  return count;
}

export async function getSessionIngestProgress(sessionId: string): Promise<SessionIngestProgress> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT
       COUNT(*) FILTER (WHERE su.included = true AND su.document_id IS NOT NULL) AS total_docs,
       COUNT(*) FILTER (
         WHERE su.included = true AND su.document_id IS NOT NULL
           AND COALESCE(d.status, 'pending') = 'pending'
       ) AS pending_docs,
       COUNT(*) FILTER (
         WHERE su.included = true AND su.document_id IS NOT NULL
           AND d.status = 'processing'
       ) AS processing_docs,
       COUNT(*) FILTER (
         WHERE su.included = true AND su.document_id IS NOT NULL
           AND d.status = 'ready'
       ) AS ready_docs,
       COUNT(*) FILTER (
         WHERE su.included = true AND su.document_id IS NOT NULL
           AND d.status = 'failed'
       ) AS failed_docs
     FROM scrape_urls su
     LEFT JOIN documents d ON d.id = su.document_id
     WHERE su.session_id = $1`,
    [sessionId]
  );

  return {
    totalDocs: Number(row?.total_docs ?? 0),
    pendingDocs: Number(row?.pending_docs ?? 0),
    processingDocs: Number(row?.processing_docs ?? 0),
    readyDocs: Number(row?.ready_docs ?? 0),
    failedDocs: Number(row?.failed_docs ?? 0),
  };
}

export async function listRollbackDocumentsForSession(sessionId: string): Promise<KbDocument[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT DISTINCT d.*
     FROM documents d
     INNER JOIN scrape_urls su ON su.document_id = d.id
     INNER JOIN scrape_sessions ss ON ss.id = su.session_id
     WHERE su.session_id = $1
       AND (
         d.created_by_scrape_session_id = $1
         OR (
           d.created_by_scrape_session_id IS NULL
           AND d.source_type = 'url'
           AND d.created_at >= ss.created_at
         )
       )`,
    [sessionId]
  );
  return rows.map(toDocument);
}

export async function countRunningIngestJobsForSession(sessionId: string): Promise<number> {
  const row = await queryOne<{ count: string | number }>(
    `SELECT COUNT(DISTINCT ij.id) AS count
     FROM ingest_jobs ij
     INNER JOIN documents d ON d.id = ij.document_id
     INNER JOIN scrape_urls su ON su.document_id = d.id
     WHERE su.session_id = $1
       AND ij.status = 'running'`,
    [sessionId]
  );
  return Number(row?.count ?? 0);
}
