/**
 * src/modules/voice-core/realtime/generation-coordinator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provider-neutral realtime generation coordinator (plan Task 2.2).
 *
 * Owns ONLY lifecycle and concurrency for one voice session:
 *
 *   beginTurn()             — committed user turn → new generation (tears the
 *                              previous generation down first)
 *   beginSystemGeneration() — non-user assistant generation (greeting)
 *   invalidateGeneration()  — flip the current generation stale immediately
 *   cancelCurrent()         — invalidate + run registered abort callbacks
 *   isCurrentGeneration()   — the single predicate every emitter must consult
 *   registerAbort()         — chat/RAG/TTS cancellation hooks per generation
 *   completeGeneration()    — normal end of the assistant generation
 *
 * It deliberately does NOT own Qdrant, LLM implementations, provider
 * credentials or browser UI. Those stay in their existing modules; they simply
 * ask the coordinator "is my generation still allowed to speak?".
 *
 * Invariants enforced (plan §1.3 / §1.4):
 *   • exactly one active generation per session;
 *   • a new turn (or interrupt) invalidates the old generation immediately;
 *   • late events from an invalidated generation never pass isCurrentGeneration;
 *   • only a committed user turn (or an explicit system generation) may begin
 *     an assistant generation — partial STT never does;
 *   • duplicate committed turns are rejected (idempotent transcript handling).
 *
 * Pure module — runs in the browser hook, in tests, and on the server.
 */

import { mintGenerationId, isSessionId } from "./identity";

export type GenerationState = "active" | "completed" | "invalidated";

/** Why a generation stopped being current. */
export type InvalidationReason =
  | "new-turn"
  | "new-system-generation"
  | "interrupt"
  | "error"
  | "session-end";

/** One assistant generation inside a voice session. */
export interface ActiveGeneration {
  readonly sessionId: string;
  readonly generationId: string;
  /** Committed user turn this generation answers, or null for system output. */
  readonly turnId: string | null;
  /** "turn" (answers a user turn) | "system" (greeting / announcement). */
  readonly kind: "turn" | "system";
  readonly startedAt: number;
  state: GenerationState;
}

export interface GenerationCoordinatorEvents {
  /**
   * Fired exactly once when a generation stops being current. Hooks use it to
   * clear stale output; telemetry uses it for lifecycle events.
   */
  onGenerationInvalidated?: (
    generation: Readonly<ActiveGeneration>,
    reason: InvalidationReason,
    replacedBy: string | null,
  ) => void;
}

export interface CoordinatorStats {
  sessionId: string;
  generations: number;
  turns: number;
  systemGenerations: number;
  invalidated: number;
  completed: number;
  currentGenerationId: string | null;
  currentState: GenerationState | null;
}

export class GenerationCoordinator {
  private readonly session: string;
  private readonly events: GenerationCoordinatorEvents;
  private readonly aborts = new Set<() => void>();
  private readonly seenTurns = new Set<string>();
  private current: ActiveGeneration | null = null;
  private generations = 0;
  private turnCount = 0;
  private systemCount = 0;
  private invalidatedCount = 0;
  private completedCount = 0;

  constructor(sessionId: string, events?: GenerationCoordinatorEvents) {
    // Tolerate any non-empty string (relay/test contexts) but keep the
    // canonical prefix when the caller minted a proper session id.
    this.session = sessionId && sessionId.length > 0 ? sessionId : `vrs_${mintGenerationId()}`;
    this.events = events ?? {};
  }

  get sessionId(): string {
    return this.session;
  }

  get currentGeneration(): Readonly<ActiveGeneration> | null {
    return this.current;
  }

  /**
   * Begin the assistant generation for a COMMITTED user turn.
   * Returns null when the turn was already committed (duplicate final
   * transcript, replayed event, double-fire) — the caller must not start a
   * second generation for it.
   */
  beginTurn(turnId: string): ActiveGeneration | null {
    if (!turnId) return null;
    if (this.seenTurns.has(turnId)) return null;
    this.seenTurns.add(turnId);
    this.turnCount++;
    return this.beginGeneration("turn", turnId);
  }

  /**
   * Begin a non-user assistant generation (connect greeting, farewell).
   * Always succeeds; replaces any current generation like a turn would.
   */
  beginSystemGeneration(): ActiveGeneration {
    return this.beginGeneration("system", null);
  }

  /**
   * Flip the current generation stale WITHOUT running abort callbacks.
   * Use when only the "no longer allowed to speak" bit must flip.
   * Idempotent: returns false when there was nothing (valid) to invalidate.
   */
  invalidateGeneration(reason: InvalidationReason = "interrupt"): boolean {
    const gen = this.current;
    if (!gen || gen.state === "invalidated") return false;
    gen.state = "invalidated";
    this.invalidatedCount++;
    this.events.onGenerationInvalidated?.(gen, reason, null);
    return true;
  }

  /** The predicate. Invalidated and superseded generations fail it. */
  isCurrentGeneration(generationId: string | null | undefined): boolean {
    if (!generationId) return false;
    const gen = this.current;
    return gen !== null && gen.generationId === generationId && gen.state !== "invalidated";
  }

  /**
   * Register a cancellation callback for the CURRENT generation's resources
   * (chat AbortController, RAG fetch, HTTP TTS fetch, TTS socket teardown…).
   * Returns an unregister function. Callbacks run once, on cancelCurrent()
   * or when the next generation begins, then the set is cleared.
   */
  registerAbort(fn: () => void): () => void {
    this.aborts.add(fn);
    return () => {
      this.aborts.delete(fn);
    };
  }

  /** Invalidate the current generation and cancel everything registered for it. */
  cancelCurrent(reason: InvalidationReason = "interrupt"): void {
    if (this.invalidateGeneration(reason)) {
      this.runAborts();
    }
  }

  /**
   * Normal completion of the current generation (LLM stream done). The
   * generation stays current — its already-queued audio may keep playing —
   * but no new resource registration is accepted for it.
   */
  completeGeneration(): boolean {
    const gen = this.current;
    if (!gen || gen.state !== "active") return false;
    gen.state = "completed";
    this.completedCount++;
    return true;
  }

  hasTurn(turnId: string): boolean {
    return this.seenTurns.has(turnId);
  }

  stats(): CoordinatorStats {
    return {
      sessionId: this.session,
      generations: this.generations,
      turns: this.turnCount,
      systemGenerations: this.systemCount,
      invalidated: this.invalidatedCount,
      completed: this.completedCount,
      currentGenerationId: this.current?.generationId ?? null,
      currentState: this.current?.state ?? null,
    };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private beginGeneration(kind: "turn" | "system", turnId: string | null): ActiveGeneration {
    const previous = this.current;
    const generation: ActiveGeneration = {
      sessionId: this.session,
      generationId: mintGenerationId(),
      turnId,
      kind,
      startedAt: Date.now(),
      state: "active",
    };
    // Flip current FIRST: the moment a new generation exists, the old one is
    // no longer allowed to speak — even if its teardown throws.
    this.current = generation;
    this.generations++;
    if (kind === "system") this.systemCount++;

    if (previous && previous.state !== "invalidated") {
      previous.state = "invalidated";
      this.invalidatedCount++;
      this.runAborts();
      this.events.onGenerationInvalidated?.(
        previous,
        kind === "turn" ? "new-turn" : "new-system-generation",
        generation.generationId,
      );
    }
    return generation;
  }

  private runAborts(): void {
    const callbacks = [...this.aborts];
    this.aborts.clear();
    for (const cb of callbacks) {
      try {
        cb();
      } catch {
        // A failing teardown must never block the next generation.
      }
    }
  }
}

/** Convenience: is the string a canonical session id (see identity.ts). */
export function isValidCoordinatorSession(sessionId: string): boolean {
  return isSessionId(sessionId);
}
