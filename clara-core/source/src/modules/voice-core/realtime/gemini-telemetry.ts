/**
 * src/modules/voice-core/realtime/gemini-telemetry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Gemini Live latency telemetry (gap-closure Phase J leftover).
 *
 * Gemini Live is a vendor-native VAD lifecycle: the platform does not drive
 * the turn boundary (no coordinator, no explicit "user turn committed" event),
 * so the OpenAI-style ref wiring cannot be copied verbatim. This module owns
 * the two Gemini-specific measurement decisions:
 *
 *   1. Utterance boundary — the first inputTranscription after a
 *      turnComplete/interrupted starts a NEW turn record (the greeting/boot
 *      record is replaced by the first committed user utterance, exactly the
 *      OpenAI baseline's system-generation semantics).
 *
 *   2. Retroactive stt.final — Gemini streams the running user transcript
 *      with no final marker. The last transcript timestamp is remembered on
 *      every inputTranscription and committed as stt.final at the first
 *      evidence the vendor VAD committed the turn (rag_search toolCall or
 *      the first modelTurn output). `LatencyTracker.mark` is
 *      first-wins-per-stage and accepts an explicit timestamp, so the
 *      measurement stays honest without post-hoc rewriting.
 *
 * Stage mapping (same stage names as every other provider — plan §11):
 *   session.start        session descriptor fetched + setupComplete flow begun
 *   stt.first_partial    first inputTranscription with text
 *   stt.final            last inputTranscription before VAD commit (retro)
 *   rag.start / rag.end  rag_search toolCall fetch window
 *   llm.start            first model output evidence (toolCall or modelTurn)
 *   llm.first_token      first outputTranscription / modelTurn text
 *   tts.start            native audio: same instant as llm.start
 *   tts.first_audio      first modelTurn inlineData audio chunk
 *   browser.first_audio  same chunk queued for immediate gapless playback
 *   turn.complete        serverContent.turnComplete (emits the event)
 *   interrupt            serverContent.interrupted
 *
 * Pure module — no React, no WebSocket, no timers. The hook translates
 * vendor frames into method calls; tests drive event sequences directly.
 * Timings only: no transcripts, no secrets, no authorization data.
 */

import { LatencyTracker } from "./latency-tracker";
import { mintSessionId } from "./identity";

/** Payload of the `clara:voice:latency` window event (same contract as the
 *  other providers — the benchmark harness consumes it verbatim). */
export type GeminiTelemetryEvent = ReturnType<GeminiTurnTelemetry["telemetry"]>;

const PROVIDER = "gemini";

export class GeminiTurnTelemetry {
  private tracker = new LatencyTracker();
  private readonly sessionId = mintSessionId();
  private model: string | null = null;
  /** Timestamp of the most recent inputTranscription (retro stt.final base). */
  private lastUserTranscriptAt: number | null = null;
  /** True while inputTranscription events belong to the current turn record. */
  private inUserUtterance = false;

  constructor(private readonly now: () => number = Date.now) {}

  /** Session descriptor received — starts the boot record (replaced by the
   *  greeting turn and then by every committed user utterance). */
  sessionReady(model?: string | null, at?: number): void {
    if (typeof model === "string" && model.trim()) this.model = model.trim();
    this.tracker.beginTurn({ sessionId: this.sessionId, provider: PROVIDER, model: this.model });
    this.tracker.mark("session.start", at ?? this.now());
  }

  /** The optional greeting is a system generation (mirrors the OpenAI
   *  baseline: replaced by the first committed user utterance). */
  greetingTurn(at?: number): void {
    this.tracker.beginTurn({ sessionId: this.sessionId, provider: PROVIDER, model: this.model });
    const t = at ?? this.now();
    this.tracker.mark("llm.start", t);
    this.tracker.mark("tts.start", t);
  }

  /** Every inputTranscription carrying text. The first event of a new
   *  utterance begins a fresh turn record. */
  userTranscript(at?: number): void {
    const t = at ?? this.now();
    this.lastUserTranscriptAt = t;
    if (!this.inUserUtterance) {
      this.inUserUtterance = true;
      this.tracker.beginTurn({ sessionId: this.sessionId, provider: PROVIDER, model: this.model });
    }
    this.tracker.mark("stt.first_partial", t);
  }

  /** First evidence the vendor VAD committed the user turn and the model began
   *  working: a rag_search toolCall or the first modelTurn output. Idempotent. */
  modelOutput(at?: number): void {
    const t = at ?? this.now();
    this.commitSttFinal();
    this.tracker.mark("llm.start", t);
    this.tracker.mark("tts.start", t); // native audio: generation IS synthesis
  }

  /** rag_search toolCall fetch window. */
  ragStart(at?: number): void {
    this.modelOutput(at); // the tool call itself is the model's first output
    this.tracker.mark("rag.start", at ?? this.now());
  }

  ragEnd(at?: number): void {
    this.tracker.mark("rag.end", at ?? this.now());
  }

  /** First outputTranscription / modelTurn inline text. */
  modelText(at?: number): void {
    this.tracker.mark("llm.first_token", at ?? this.now());
  }

  /** First modelTurn inlineData audio chunk (queued for immediate gapless
   *  playback — the closest observable browser audio instant on this path). */
  modelAudio(at?: number): void {
    const t = at ?? this.now();
    this.modelOutput(t);
    this.tracker.mark("tts.first_audio", t);
    this.tracker.mark("browser.first_audio", t);
  }

  /** serverContent.turnComplete — closes the utterance and emits telemetry. */
  turnComplete(at?: number): void {
    this.tracker.mark("turn.complete", at ?? this.now());
    this.inUserUtterance = false;
  }

  /** serverContent.interrupted — vendor barge-in closed the utterance. */
  interrupted(at?: number): void {
    this.tracker.mark("interrupt", at ?? this.now());
    this.inUserUtterance = false;
  }

  /** Safe telemetry event for the CURRENT record (timings only), or null. */
  telemetry(): ReturnType<LatencyTracker["telemetry"]> {
    return this.tracker.telemetry();
  }

  /** Current turn record (tests / diagnostics). */
  get current(): ReturnType<LatencyTracker["telemetry"]> {
    return this.tracker.telemetry();
  }

  private commitSttFinal(): void {
    if (this.lastUserTranscriptAt === null) return;
    this.tracker.mark("stt.final", this.lastUserTranscriptAt);
  }
}
