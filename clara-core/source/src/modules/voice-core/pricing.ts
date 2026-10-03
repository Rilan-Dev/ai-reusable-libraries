/**
 * src/modules/voice-core/pricing.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit-cost model for voice provider usage, mirroring the per-model price
 * list philosophy of src/modules/ai-core/model-catalog.ts.
 *
 * Costs are computed from usage facts (characters / audio-seconds) reported
 * by the caller, NEVER guessed from the response body. Env overrides let
 * operators pin exact negotiated prices without a deploy.
 */

import { findTTSModel, findSarvamSTTModel, findSarvamTTSModel } from "./model-catalog";

/** USD per 1,000 TTS characters, with env override. */
export function ttsUsdPer1kChars(modelId: string): number {
  const override = Number(process.env.ELEVENLABS_TTS_USD_PER_1K_CHARS);
  if (Number.isFinite(override) && override > 0) return override;
  return findTTSModel(modelId)?.usdPer1kChars ?? 0.06;
}

/** USD per audio-minute of STT, with env override. */
export function sttUsdPerMinute(): number {
  const override = Number(process.env.ELEVENLABS_STT_USD_PER_MIN);
  if (Number.isFinite(override) && override > 0) return override;
  return 0.4;
}

/** USD per conversation-minute (Mode B), with env override. */
export function conversationUsdPerMinute(): number {
  const override = Number(process.env.ELEVENLABS_CONV_USD_PER_MIN);
  if (Number.isFinite(override) && override > 0) return override;
  return 0.1;
}

/** Convert USD to integer micro-dollars (the usage_events unit). */
export function usdToMicros(usd: number): number {
  return Math.max(0, Math.round(usd * 1_000_000));
}

export function ttsCostUsdMicros(modelId: string, characters: number): number {
  return usdToMicros((characters / 1_000) * ttsUsdPer1kChars(modelId));
}

export function sttCostUsdMicros(audioSeconds: number): number {
  return usdToMicros((audioSeconds / 60) * sttUsdPerMinute());
}

export function conversationCostUsdMicros(durationSeconds: number): number {
  return usdToMicros((durationSeconds / 60) * conversationUsdPerMinute());
}

// ─── Sarvam (V3) — INR list prices converted at catalogue build; env
// overrides keep dashboards honest when the rupee moves (plan §13). ─────────

/** USD per 1,000 Bulbul TTS characters, with env override. */
export function sarvamTtsUsdPer1kChars(modelId: string): number {
  const override = Number(process.env.SARVAM_TTS_USD_PER_1K_CHARS);
  if (Number.isFinite(override) && override > 0) return override;
  return findSarvamTTSModel(modelId)?.usdPer1kChars ?? 0.036;
}

/** USD per audio-minute of Saaras STT (₹30/hour ≈ $0.36/h), with env override. */
export function sarvamSttUsdPerMinute(modelId?: string): number {
  const override = Number(process.env.SARVAM_STT_USD_PER_MIN);
  if (Number.isFinite(override) && override > 0) return override;
  return (modelId ? findSarvamSTTModel(modelId)?.usdPerMinute : undefined) ?? 0.006;
}

export function sarvamTtsCostUsdMicros(modelId: string, characters: number): number {
  return usdToMicros((characters / 1_000) * sarvamTtsUsdPer1kChars(modelId));
}

export function sarvamSttCostUsdMicros(audioSeconds: number, modelId?: string): number {
  return usdToMicros((audioSeconds / 60) * sarvamSttUsdPerMinute(modelId));
}
