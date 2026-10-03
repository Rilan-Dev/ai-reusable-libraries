/**
 * src/modules/knowledge-bases/worker/ingest-worker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Background ingest worker.
 *
 * One call to processNextJob() handles exactly one job:
 *   1. Claim a pending ingest_job atomically (SELECT FOR UPDATE SKIP LOCKED)
 *   2. Decode the file payload (base64 → Buffer)
 *   3. Parse the document (PDF / DOCX / TXT)
 *   4. Chunk the text
 *   5. Embed chunks + upsert to Qdrant with kbId + documentId in payload
 *   6. Mark document as 'ready' + job as 'done'
 *   7. On any error: mark document 'failed' + job failed/retry
 *
 * Called by:
 *   POST /api/worker/ingest  — triggered after each upload + by external cron
 */

import { ensureMigrated } from "@/lib/db/migrate";
import { parseDocumentFromBuffer } from "@/modules/admin/core/ingest/document-loader";
import { chunkText } from "@/modules/admin/core/ingest/chunker";
import { upsertDocumentsKb } from "@/modules/admin/core/vector-store-kb";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import {
  claimPendingJobById,
  claimNextPendingJob,
  failOrphanedProcessingDocuments,
  resetStaleIngestJobs,
  type IngestJobWithPayload,
  markJobDone,
  markJobFailed,
  updateDocumentStatus,
} from "@/modules/knowledge-bases/core/documents-db";

/** How long a 'running' job may stay unclaimed before recovery resets it. */
export const INGEST_STALE_JOB_MS = (() => {
  const v = Number(process.env.INGEST_STALE_JOB_MS ?? "600000");
  return Number.isFinite(v) && v > 0 ? v : 600_000;
})();

export type ProcessResult =
  | { status: "processed"; documentId: string; chunkCount: number }
  | { status: "idle" }
  | { status: "error"; error: string };

async function processClaimedJob(job: IngestJobWithPayload): Promise<ProcessResult> {
  const { documentId, kbId, id: jobId, filePayload } = job;

  try {
    // Queue consumers are fresh Vercel functions and do not necessarily pass
    // through the normal app bootstrap. Load DB-backed provider credentials and
    // migrations before resolving the embedding provider.
    await ensureMigrated();

    if (!filePayload) {
      throw new Error("Job has no file payload — cannot process");
    }

    await updateDocumentStatus(documentId, "processing");

    const buffer = Buffer.from(filePayload.base64, "base64");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) throw new Error(`Knowledge base ${kbId} not found`);

    const parsed = await parseDocumentFromBuffer(buffer, filePayload.filename, filePayload.mimeType);

    if (!parsed.text?.trim()) {
      throw new Error("Document parsed successfully but contained no extractable text");
    }

    const chunks = chunkText(parsed.text);
    if (chunks.length === 0) {
      throw new Error("Chunking produced 0 chunks — document may be empty or corrupt");
    }

    console.log(
      `[ingest-worker] document ${documentId}: parsed ${parsed.text.length} chars → ${chunks.length} chunks`
    );

    await upsertDocumentsKb(kb.qdrantCollection, chunks, {
      kbId,
      documentId,
      title: parsed.title || filePayload.filename,
      originalFilename: filePayload.filename,
    });

    await updateDocumentStatus(documentId, "ready", { chunkCount: chunks.length });
    await markJobDone(jobId);

    console.log(`[ingest-worker] ✅ job ${jobId} completed — ${chunks.length} chunks indexed`);
    return { status: "processed", documentId, chunkCount: chunks.length };

  } catch (err) {
    const message = (err as Error).message;
    console.error(`[ingest-worker] ❌ job ${jobId} failed:`, message);

    await updateDocumentStatus(documentId, "failed", { errorMessage: message });

    const delaySec = 30 * Math.pow(2, job.attempts - 1);
    await markJobFailed(jobId, message, delaySec);

    return { status: "error", error: message };
  }
}

/**
 * Processes the next pending ingest job from the queue.
 * Returns immediately if no jobs are pending.
 */
export async function processNextJob(): Promise<ProcessResult> {
  const job = await claimNextPendingJob();
  if (!job) return { status: "idle" };

  return processClaimedJob(job);
}

export async function processJobById(jobId: string): Promise<ProcessResult> {
  const job = await claimPendingJobById(jobId);
  if (!job) return { status: "idle" };

  return processClaimedJob(job);
}

/**
 * One queue maintenance pass: recover interrupted jobs, then drain pending
 * work. Runs from the background poller and (fire-and-forget) after uploads.
 */
export async function runIngestMaintenance(maxJobs = 20): Promise<{
  processed: number;
  errors: number;
  recoveredJobs: number;
  recoveredDocuments: number;
}> {
  const recoveredJobs = await resetStaleIngestJobs(INGEST_STALE_JOB_MS).catch((err) => {
    console.error("[ingest-worker] stale job recovery failed:", (err as Error).message);
    return 0;
  });
  const recoveredDocuments = await failOrphanedProcessingDocuments().catch((err) => {
    console.error("[ingest-worker] orphaned document recovery failed:", (err as Error).message);
    return 0;
  });
  const { processed, errors } = await drainQueue(maxJobs);
  return { processed, errors, recoveredJobs, recoveredDocuments };
}

/**
 * Fire-and-forget queue kick used after uploads and reprocess requests.
 *
 * This intentionally does NOT make an HTTP request back to this server: the
 * historical `${req.nextUrl.origin}/api/worker/ingest` self-fetch fails inside
 * Docker deployments where the public origin is not resolvable/reachable from
 * the container ("[upload] worker trigger failed: fetch failed"), which left
 * jobs unprocessed forever. Calling drainQueue() in-process is equivalent —
 * the claim is atomic (FOR UPDATE SKIP LOCKED) so the poller and concurrent
 * HTTP drains can never double-process the same job.
 */
export function kickIngestQueue(maxJobs = 20): void {
  runIngestMaintenance(maxJobs).catch((err) => {
    console.error("[ingest-worker] queue kick failed:", (err as Error).message);
  });
}

/**
 * Drain all pending jobs sequentially (useful for batch runs or cron).
 * Stops when the queue is empty or maxJobs is reached.
 */
export async function drainQueue(maxJobs = 20): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < maxJobs; i++) {
    const result = await processNextJob();
    if (result.status === "idle") break;
    if (result.status === "processed") processed++;
    if (result.status === "error") errors++;
  }

  return { processed, errors };
}

export async function processJobsById(
  jobIds: string[],
  options: {
    shouldStop?: () => Promise<boolean> | boolean;
    onProgress?: (progress: {
      total: number;
      processed: number;
      errors: number;
      currentJobId: string;
      result: ProcessResult;
    }) => Promise<void> | void;
  } = {}
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  for (const jobId of jobIds) {
    if (await options.shouldStop?.()) break;

    const result = await processJobById(jobId);
    if (result.status === "processed") processed++;
    if (result.status === "error") errors++;

    await options.onProgress?.({
      total: jobIds.length,
      processed,
      errors,
      currentJobId: jobId,
      result,
    });
  }

  return { processed, errors };
}
