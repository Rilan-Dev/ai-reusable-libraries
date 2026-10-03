/**
 * src/modules/cloud-jobs/queue.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Background job publishing with two transports:
 *
 *   vercel — Vercel Queues (`@vercel/queue`). Needs the Vercel runtime's OIDC
 *            token, so it only works in Vercel Functions. Consumers are the
 *            /api/queue/* routes.
 *   local  — run the job in this Node process (Docker, VPS, `next start`).
 *            Ingest jobs are also recovered by the in-process ingest poller,
 *            so nothing is lost if the process restarts mid-job.
 *
 * The transport is chosen per call: CLOUD_QUEUE_MODE=vercel|local forces
 * one; otherwise Vercel is used only when running on Vercel (VERCEL=1).
 * Using Vercel Queues outside Vercel fails every upload with
 * "Failed to get OIDC token", which is what this switch prevents.
 */

import { send } from "@vercel/queue";

export const CLOUD_JOB_TOPICS = {
  ingest: "clara-ingest",
  crawl: "clara-crawl",
  scrape: "clara-scrape",
  retry: "clara-retry",
} as const;

export type CloudJobKind = keyof typeof CLOUD_JOB_TOPICS;

export type CloudJobEnvelope = {
  jobId: string;
  kind: CloudJobKind;
  payload?: Record<string, unknown>;
};

export type CloudQueueTransport = "vercel" | "local";

export function cloudQueueTransport(env: Record<string, string | undefined> = process.env): CloudQueueTransport {
  const forced = env.CLOUD_QUEUE_MODE?.trim().toLowerCase();
  if (forced === "vercel" || forced === "local") return forced;
  return env.VERCEL ? "vercel" : "local";
}

// Local transport dedupe — mirrors the Vercel idempotency key while a job
// with the same key is still queued or running in this process.
const localInFlight = new Set<string>();

function runLocally(
  envelope: CloudJobEnvelope,
  idempotencyKey: string,
  delaySeconds?: number,
): { messageId: string | null } {
  const messageId = `local:${idempotencyKey}`;
  if (localInFlight.has(idempotencyKey)) return { messageId };
  localInFlight.add(idempotencyKey);

  const execute = () => {
    void import("./handlers")
      .then(({ dispatchCloudJob }) => dispatchCloudJob(envelope.kind, envelope))
      .catch((err: unknown) => {
        console.error(`[cloud-jobs:local] ${envelope.kind} ${envelope.jobId} failed:`, (err as Error)?.message ?? err);
      })
      .finally(() => localInFlight.delete(idempotencyKey));
  };

  // Always async: the caller's HTTP response must not wait for the job.
  const timer = setTimeout(execute, Math.max(0, (delaySeconds ?? 0) * 1000));
  if (typeof timer.unref === "function") timer.unref();
  return { messageId };
}

export async function enqueueCloudJob(
  kind: CloudJobKind,
  jobId: string,
  payload: Record<string, unknown> = {},
  options: { delaySeconds?: number; retentionSeconds?: number } = {},
): Promise<{ messageId: string | null }> {
  if (!jobId.trim()) throw new Error("Cloud job id is required");

  const envelope: CloudJobEnvelope = { jobId, kind, payload };
  const idempotencyKey = `clara:${kind}:${jobId}`;

  if (cloudQueueTransport() === "local") {
    return runLocally(envelope, idempotencyKey, options.delaySeconds);
  }

  return send(CLOUD_JOB_TOPICS[kind], envelope, {
    idempotencyKey,
    delaySeconds: options.delaySeconds,
    retentionSeconds: options.retentionSeconds ?? 7 * 24 * 60 * 60,
  });
}

export const enqueueIngestJob = (jobId: string) =>
  enqueueCloudJob("ingest", jobId);

export const enqueueCrawlJob = (
  jobId: string,
  payload: Record<string, unknown>,
  options?: { delaySeconds?: number },
) => enqueueCloudJob("crawl", jobId, payload, options);

export const enqueueScrapeJob = (
  jobId: string,
  payload: Record<string, unknown> = {},
  options?: { delaySeconds?: number },
) => enqueueCloudJob("scrape", jobId, payload, options);

export const enqueueRetryJob = (
  jobId: string,
  payload: Record<string, unknown>,
  options?: { delaySeconds?: number },
) => enqueueCloudJob("retry", jobId, payload, options);
