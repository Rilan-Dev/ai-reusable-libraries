/**
 * src/modules/voice-core/realtime/reconnect-policy.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Bounded reconnect policy for realtime vendor sockets (plan Phase 9:
 * "Do not implement infinite reconnect loops").
 *
 * The relays previously retried upstream reconnection forever with a fixed
 * 250 ms delay — a dead vendor endpoint produced an infinite churn of
 * connect/close cycles. This policy caps the attempts and applies linear
 * backoff; once the budget is exhausted the caller MUST surface a fatal
 * error so the browser can recover deterministically (invalidate generation
 * → close sockets → clear playback → recoverable error → idle).
 *
 * A SUCCESSFUL upstream reconnection resets the budget — a long-lived
 * session may legitimately ride out several brief vendor blips.
 */

export interface ReconnectPolicy {
  /** Record a successful upstream connection (resets the budget). */
  succeeded(): void;
  /**
   * Next backoff delay in ms (linear: base × attempt), or null when the
   * budget is exhausted — the caller must then give up fatally.
   */
  nextDelayMs(): number | null;
  /** Attempts consumed since the last success. */
  readonly attempts: number;
  /** True once the budget is exhausted. */
  readonly exhausted: boolean;
}

export function createReconnectPolicy(
  maxAttempts = 5,
  baseDelayMs = 250,
): ReconnectPolicy {
  let attempts = 0;
  let exhausted = false;

  return {
    succeeded() {
      attempts = 0;
      exhausted = false;
    },
    nextDelayMs() {
      if (exhausted || attempts >= maxAttempts) {
        exhausted = true;
        return null;
      }
      attempts += 1;
      return baseDelayMs * attempts;
    },
    get attempts() {
      return attempts;
    },
    get exhausted() {
      return exhausted;
    },
  };
}
