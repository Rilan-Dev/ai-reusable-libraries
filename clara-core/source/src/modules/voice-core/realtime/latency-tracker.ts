/**
 * src/modules/voice-core/realtime/latency-tracker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Realtime latency instrumentation (plan Task 4.2 + Phase 10 primitive).
 *
 * Captures per-turn stage marks for a realtime voice session and derives the
 * latency profile the plan requires:
 *
 *   TTFA = browser.first_audio - stt.final
 *
 *   stage latencies:
 *     STT       = stt.final - (stt.first_partial | turn.start)
 *     RAG       = rag.end - rag.start
 *     LLM       = llm.first_token - llm.start
 *     TTS       = tts.first_audio - tts.start
 *     playback  = browser.first_audio - tts.first_audio
 *
 * Stage names follow plan §11 exactly, so every provider tags the same
 * checkpoints and cross-provider p50/p95 comparisons are apples-to-apples.
 *
 * Rules (plan §11):
 *   • every record carries sessionId + generationId + provider + model;
 *   • marks are idempotent — the FIRST occurrence of a stage wins, so
 *     duplicate/late vendor events cannot skew the measurement;
 *   • no transcripts and no secrets are recorded — timings only.
 *
 * Pure module — browser hooks, relays, and tests all share it.
 */

import type { ActiveGeneration } from "./generation-coordinator";

export type LatencyStage =
  | "session.start"
  | "stt.first_partial"
  | "stt.final"
  | "turn.start"
  | "rag.start"
  | "rag.end"
  | "llm.start"
  | "llm.first_token"
  | "tts.start"
  | "tts.first_audio"
  | "browser.first_audio"
  | "interrupt"
  | "turn.complete"
  | "provider.error"
  | "session.end";

export interface TurnLatencyRecord {
  sessionId: string;
  generationId: string | null;
  turnId: string | null;
  provider: string;
  model: string | null;
  /** Stage → epoch ms. First mark per stage wins. */
  marks: Partial<Record<LatencyStage, number>>;
}

export interface TurnStageLatencies {
  sttMs: number | null;
  ragMs: number | null;
  llmMs: number | null;
  ttsMs: number | null;
  playbackMs: number | null;
  ttfaMs: number | null;
}

export interface TurnLatencyInit {
  sessionId: string;
  generationId?: string | null;
  turnId?: string | null;
  provider: string;
  model?: string | null;
  /** Override the turn.start timestamp (replay/aggregation). */
  startedAt?: number;
}

function now(): number {
  return Date.now();
}

/**
 * A mark-scoped view of ONE turn record.
 *
 * Why handles exist: turn-scoped marks (rag/llm/tts/playback/complete) must
 * land on the record of the turn that produced them. A new user utterance
 * can open a fresh interim record WHILE an assistant turn is still streaming
 * (barge-in / looping input) — tracker-level mark() would then bleed the
 * in-flight turn's marks onto the wrong record. A handle keeps marking the
 * record it was created for, immune to later beginTurn replacements.
 */
export interface TurnLatencyHandle {
  /** Mark a stage on THIS handle's record (first-wins, same as tracker.mark). */
  mark(stage: LatencyStage, at?: number): void;
  /** Safe telemetry event for THIS handle's record (timings only). */
  telemetry(): (TurnLatencyRecord & { latencies: TurnStageLatencies }) | null;
  /** The wrapped record (read-only view). */
  readonly record: Readonly<TurnLatencyRecord>;
}

export class LatencyTracker {
  private record: TurnLatencyRecord | null = null;

  /** Start tracking a new turn (replaces any previous record).
   *  The returned handle keeps marking THIS turn's record even after later
   *  beginTurn calls replace the tracker's current record. */
  beginTurn(init: TurnLatencyInit): TurnLatencyHandle {
    const record: TurnLatencyRecord = {
      sessionId: init.sessionId,
      generationId: init.generationId ?? null,
      turnId: init.turnId ?? null,
      provider: init.provider,
      model: init.model ?? null,
      marks: { "turn.start": init.startedAt ?? now() },
    };
    this.record = record;
    return {
      mark: (stage, at) => {
        if (record.marks[stage] === undefined) record.marks[stage] = at ?? now();
      },
      telemetry: () => {
        const latencies = latenciesFor(record);
        return latencies ? { ...record, latencies } : null;
      },
      record,
    };
  }

  /** Convenience: begin a turn from a coordinator generation. */
  beginGenerationTurn(generation: ActiveGeneration, provider: string, model?: string | null): TurnLatencyHandle {
    return this.beginTurn({
      sessionId: generation.sessionId,
      generationId: generation.generationId,
      turnId: generation.turnId,
      provider,
      model,
    });
  }

  /**
   * Record a stage timestamp. Idempotent per stage: the first mark wins —
   * late/duplicate vendor events cannot rewrite the measurement.
   */
  mark(stage: LatencyStage, at?: number): void {
    if (!this.record) return;
    if (this.record.marks[stage] === undefined) {
      this.record.marks[stage] = at ?? now();
    }
  }

  /**
   * Snapshot the STT stage marks of the CURRENT record.
   *
   * Why this exists: in every Clara-owned realtime hook the committed user
   * turn begins only AFTER the vendor finalized the user transcript
   * (stt.final was already marked on the interim record). beginTurn /
   * beginGenerationTurn then REPLACES the record, which silently dropped the
   * STT timestamps and made TTFA (= browser.first_audio - stt.final) null on
   * every real session. The hook snapshots sttMarks() before the replacement
   * and re-applies them with carrySttMarks() on the fresh record — the
   * original timestamps are preserved, first-wins still applies.
   */
  sttMarks(): { firstPartial?: number; final?: number } {
    const m = this.record?.marks;
    if (!m) return {};
    return {
      ...(m["stt.first_partial"] !== undefined ? { firstPartial: m["stt.first_partial"] } : {}),
      ...(m["stt.final"] !== undefined ? { final: m["stt.final"] } : {}),
    };
  }

  /** Re-apply marks captured via sttMarks() onto the CURRENT record. */
  carrySttMarks(marks: { firstPartial?: number; final?: number }): void {
    if (marks.firstPartial !== undefined) this.mark("stt.first_partial", marks.firstPartial);
    if (marks.final !== undefined) this.mark("stt.final", marks.final);
  }

  /**
   * Ensure the current record can receive a NEW user utterance's STT marks.
   *
   * A record that belongs to a committed turn (generationId set) or has
   * completed (turn.complete marked) cannot take fresh first-wins STT
   * marks — the previous turn's timestamps would win and corrupt the next
   * turn's TTFA. Start a fresh interim record with the same session
   * identity instead. No-op for a genuinely interim record (the very record
   * the live utterance is supposed to mark).
   *
   * `interrupt` deliberately does NOT count as closed: a barge-in can land
   * an interrupt mark on the interim record of the utterance that is still
   * being spoken — resetting there would discard that utterance's own
   * partials. An interrupted GENERATION record is still caught by the
   * generationId condition.
   *
   * Hooks call this in their transcript-partial handler before marking
   * stt.first_partial — it is the utterance boundary for telemetry.
   */
  prepareForUtterance(): void {
    const r = this.record;
    if (!r) return;
    if (r.generationId !== null || r.marks["turn.complete"] !== undefined) {
      this.beginTurn({ sessionId: r.sessionId, provider: r.provider, model: r.model });
    }
  }

  get current(): Readonly<TurnLatencyRecord> | null {
    return this.record;
  }

  /** Derive the stage latency profile + TTFA for the current turn. */
  latencies(): TurnStageLatencies | null {
    const record = this.record;
    if (!record) return null;
    return latenciesFor(record);
  }

  /** Emit a safe telemetry event (timings only — no transcripts, no secrets). */
  telemetry(): (TurnLatencyRecord & { latencies: TurnStageLatencies }) | null {
    const record = this.record;
    if (!record) return null;
    const latencies = latenciesFor(record);
    return latencies ? { ...record, latencies } : null;
  }
}

/** Shared latency derivation for tracker-level and handle-level reads. */
function latenciesFor(record: TurnLatencyRecord): TurnStageLatencies | null {
  const m = record.marks;
  const delta = (a: LatencyStage, b: LatencyStage): number | null => {
    const av = m[a];
    const bv = m[b];
    if (av === undefined || bv === undefined) return null;
    return Math.max(0, av - bv);
  };
  const sttBase = m["stt.first_partial"] !== undefined ? "stt.first_partial" : "turn.start";
  return {
    sttMs: delta("stt.final", sttBase),
    ragMs: delta("rag.end", "rag.start"),
    llmMs: delta("llm.first_token", "llm.start"),
    ttsMs: delta("tts.first_audio", "tts.start"),
    playbackMs: delta("browser.first_audio", "tts.first_audio"),
    ttfaMs: delta("browser.first_audio", "stt.final"),
  };
}

// ── Aggregation (p50/p95 across runs) ───────────────────────────────────────

/** Nearest-rank percentile. Returns null for empty input. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(Math.max(Math.ceil((p / 100) * sorted.length), 1), sorted.length);
  return sorted[rank - 1];
}

export interface LatencySummary {
  count: number;
  ttfa: { p50: number | null; p95: number | null };
  stt: { p50: number | null; p95: number | null };
  rag: { p50: number | null; p95: number | null };
  llm: { p50: number | null; p95: number | null };
  tts: { p50: number | null; p95: number | null };
  playback: { p50: number | null; p95: number | null };
}

/** Aggregate finished turn records into the p50/p95 baseline report. */
export function summarizeLatency(turns: Array<Readonly<TurnLatencyRecord>>): LatencySummary {
  const tracker = new LatencyTracker();
  const derived = turns.map((turn) => {
    tracker.beginTurn({
      sessionId: turn.sessionId,
      generationId: turn.generationId,
      turnId: turn.turnId ?? null,
      provider: turn.provider,
      model: turn.model,
      startedAt: turn.marks["turn.start"],
    });
    for (const [stage, at] of Object.entries(turn.marks)) {
      if (at !== undefined) tracker.mark(stage as LatencyStage, at);
    }
    return tracker.latencies()!;
  });

  const stats = (values: number[]) => ({
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  });

  return {
    count: turns.length,
    ttfa: stats(derived.map((d) => d.ttfaMs).filter((v): v is number => v !== null)),
    stt: stats(derived.map((d) => d.sttMs).filter((v): v is number => v !== null)),
    rag: stats(derived.map((d) => d.ragMs).filter((v): v is number => v !== null)),
    llm: stats(derived.map((d) => d.llmMs).filter((v): v is number => v !== null)),
    tts: stats(derived.map((d) => d.ttsMs).filter((v): v is number => v !== null)),
    playback: stats(derived.map((d) => d.playbackMs).filter((v): v is number => v !== null)),
  };
}
