/**
 * src/modules/voice-core/metering.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Append-only usage_events writers for voice provider billable invocations.
 *
 * Mirrors the WS-1.1 usage-event spine discipline in analytics-db.ts:
 *   • append-only (corrections are compensating rows)
 *   • cost from measured facts (characters / audio-seconds), never guessed
 *   • metering failure must NEVER break the metered pipeline
 *
 * Chat turns in the hybrid pipeline are metered by the normal query_events
 * finalise path — STT/TTS here are distinct billable invocations, exactly
 * like embeddings are today. No double counting.
 */

import { execute } from "@/lib/db";
import {
  conversationCostUsdMicros,
  sarvamSttCostUsdMicros,
  sarvamTtsCostUsdMicros,
  sttCostUsdMicros,
  ttsCostUsdMicros,
} from "./pricing";

interface VoiceUsageEventBase {
  orgId: string | null;
  kbId?: string | null;
  agentId?: string | null;
  model: string;
  latencyMs?: number | null;
  /** Which vendor executed the billable work (usage_events.provider). */
  provider?: "elevenlabs" | "sarvam";
}

async function insertVoiceUsageEvent(row: {
  orgId: string | null;
  kbId: string | null;
  agentId: string | null;
  kind: "TTS" | "TRANSCRIPTION" | "CONVERSATION";
  model: string;
  provider: string;
  /** Reused as the numeric usage column: characters for TTS, audio-seconds for STT, duration-seconds for conversations. */
  usageAmount: number;
  costUsdMicros: number;
  latencyMs: number | null;
  metadata: Record<string, unknown>;
}): Promise<void> {
  if (row.usageAmount <= 0) return; // nothing billable to record
  try {
    await execute(
      `INSERT INTO usage_events
         (org_id, kind, agent_id, kb_id, model, provider,
          prompt_tokens, cost_usd_micros, latency_ms, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        row.orgId,
        row.kind,
        row.agentId,
        row.kbId,
        row.model,
        row.provider,
        row.usageAmount,
        row.costUsdMicros,
        row.latencyMs,
        JSON.stringify(row.metadata),
      ],
    );
  } catch (err) {
    // metering must never break the metered pipeline
    console.warn("[voice-core] failed to log usage event:", (err as Error).message);
  }
}

/** Meter one TTS invocation. `characters` = billed unit. */
export async function logTtsUsage(
  base: VoiceUsageEventBase & {
    characters: number;
    preview?: boolean;
  },
): Promise<void> {
  const provider = base.provider ?? "elevenlabs";
  await insertVoiceUsageEvent({
    orgId: base.orgId,
    kbId: base.kbId ?? null,
    agentId: base.agentId ?? null,
    kind: "TTS",
    model: base.model,
    provider,
    usageAmount: base.characters,
    costUsdMicros:
      provider === "sarvam"
        ? sarvamTtsCostUsdMicros(base.model, base.characters)
        : ttsCostUsdMicros(base.model, base.characters),
    latencyMs: base.latencyMs ?? null,
    metadata: { characters: base.characters, ...(base.preview ? { preview: true } : {}) },
  });
}

/** Meter one STT invocation. `audioSeconds` = billed unit. */
export async function logSttUsage(
  base: VoiceUsageEventBase & {
    audioSeconds: number;
    languageCode?: string | null;
  },
): Promise<void> {
  const provider = base.provider ?? "elevenlabs";
  await insertVoiceUsageEvent({
    orgId: base.orgId,
    kbId: base.kbId ?? null,
    agentId: base.agentId ?? null,
    kind: "TRANSCRIPTION",
    model: base.model,
    provider,
    usageAmount: Math.max(1, Math.round(base.audioSeconds)),
    costUsdMicros:
      provider === "sarvam"
        ? sarvamSttCostUsdMicros(base.audioSeconds, base.model)
        : sttCostUsdMicros(base.audioSeconds),
    latencyMs: base.latencyMs ?? null,
    metadata: {
      audioSeconds: base.audioSeconds,
      ...(base.languageCode ? { languageCode: base.languageCode } : {}),
    },
  });
}

/** Meter one Mode-B conversation. `durationSeconds` = billed unit. */
export async function logConversationUsage(
  base: VoiceUsageEventBase & { durationSeconds: number },
): Promise<void> {
  await insertVoiceUsageEvent({
    orgId: base.orgId,
    kbId: base.kbId ?? null,
    agentId: base.agentId ?? null,
    kind: "CONVERSATION",
    model: base.model,
    provider: "elevenlabs",
    usageAmount: Math.max(1, Math.round(base.durationSeconds)),
    costUsdMicros: conversationCostUsdMicros(base.durationSeconds),
    latencyMs: null,
    metadata: { durationSeconds: base.durationSeconds },
  });
}
