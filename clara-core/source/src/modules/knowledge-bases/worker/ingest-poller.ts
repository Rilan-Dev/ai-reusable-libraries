import type { ProcessResult } from "./ingest-worker";

export type IngestJobProcessor = () => Promise<ProcessResult>;

/**
 * Run one queue cycle. Kept separate so the long-lived worker can reuse the
 * same DB-backed claim/processing logic and tests can exercise the cycle
 * without starting timers or a real database connection.
 */
export async function runIngestPollerCycle(
  processNextJob: IngestJobProcessor,
): Promise<ProcessResult> {
  return processNextJob();
}

/**
 * Starts a single-flight polling loop for the PostgreSQL ingest queue.
 * The database claim uses FOR UPDATE SKIP LOCKED, so multiple worker
 * containers can safely run this loop without processing the same job twice.
 */
export function startIngestPoller(
  processNextJob: IngestJobProcessor,
  options: { intervalMs?: number; onResult?: (result: ProcessResult) => void } = {},
): () => void {
  const intervalMs = options.intervalMs ?? 1_000;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runIngestPollerCycle(processNextJob);
      options.onResult?.(result);
    } catch (error) {
      console.error("[ingest-poller] queue cycle failed:", (error as Error).message);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => { void tick(); }, intervalMs);

  return () => clearInterval(timer);
}
