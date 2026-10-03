/**
 * src/modules/language-core/pricing.ts + metering.ts (combined module surface)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cost model + usage_events writer for language services.
 *
 * Billed per character: translate/transliterate ₹20/10K, identify ₹3.5/10K,
 * converted at SARVAM_INR_TO_USD (operator-tunable env override — the single
 * conversion point so cost dashboards stay honest when the rupee moves).
 *
 * Metering discipline inherited from voice-core/metering.ts: append-only,
 * cost from measured facts (characters), failure never breaks the pipeline,
 * rows with usageAmount <= 0 are skipped.
 */

import { execute } from "@/lib/db";
import { findTranslateModel } from "./model-catalog";
import { usdToMicros } from "@/modules/voice-core/pricing";

// ─── Pricing ──────────────────────────────────────────────────────────────────

/** USD per 1,000 translated characters, with env override. */
export function translateUsdPer1kChars(modelId?: string): number {
  const override = Number(process.env.SARVAM_TRANSLATE_USD_PER_10K_CHARS);
  // Env override is quoted per 10K chars (the vendor unit) — normalize.
  if (Number.isFinite(override) && override > 0) return override / 10;
  return (modelId ? findTranslateModel(modelId)?.usdPer1kChars : undefined) ?? 0.024;
}

/** USD per 1,000 identified characters (₹3.5/10K), with env override. */
export function identifyUsdPer1kChars(): number {
  const override = Number(process.env.SARVAM_IDENTIFY_USD_PER_10K_CHARS);
  if (Number.isFinite(override) && override > 0) return override / 10;
  return 0.0042;
}

export function translateCostUsdMicros(modelId: string | undefined, characters: number): number {
  return usdToMicros((characters / 1_000) * translateUsdPer1kChars(modelId));
}

export function identifyCostUsdMicros(characters: number): number {
  return usdToMicros((characters / 1_000) * identifyUsdPer1kChars());
}

// ─── Metering ─────────────────────────────────────────────────────────────────

type LanguageUsageKind = "TRANSLATION" | "TRANSLITERATION";

async function insertLanguageUsageEvent(row: {
  orgId: string | null;
  kbId: string | null;
  agentId: string | null;
  kind: LanguageUsageKind;
  model: string;
  provider: string;
  usageAmount: number;
  costUsdMicros: number;
  latencyMs: number | null;
  metadata: Record<string, unknown>;
}): Promise<void> {
  if (row.usageAmount <= 0) return;
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
    console.warn("[language-core] failed to log usage event:", (err as Error).message);
  }
}

export interface LanguageUsageEventBase {
  orgId: string | null;
  kbId?: string | null;
  agentId?: string | null;
  model: string;
  latencyMs?: number | null;
}

/** Meter one translation invocation. `characters` = billed unit. */
export async function logTranslationUsage(
  base: LanguageUsageEventBase & {
    characters: number;
    sourceLanguageCode?: string | null;
    targetLanguageCode?: string | null;
  },
): Promise<void> {
  await insertLanguageUsageEvent({
    orgId: base.orgId,
    kbId: base.kbId ?? null,
    agentId: base.agentId ?? null,
    kind: "TRANSLATION",
    model: base.model,
    provider: "sarvam",
    usageAmount: base.characters,
    costUsdMicros: translateCostUsdMicros(base.model, base.characters),
    latencyMs: base.latencyMs ?? null,
    metadata: {
      characters: base.characters,
      ...(base.sourceLanguageCode ? { sourceLanguageCode: base.sourceLanguageCode } : {}),
      ...(base.targetLanguageCode ? { targetLanguageCode: base.targetLanguageCode } : {}),
    },
  });
}

/** Meter one transliteration invocation. */
export async function logTransliterationUsage(
  base: LanguageUsageEventBase & { characters: number; languageCode?: string | null },
): Promise<void> {
  await insertLanguageUsageEvent({
    orgId: base.orgId,
    kbId: base.kbId ?? null,
    agentId: base.agentId ?? null,
    kind: "TRANSLITERATION",
    model: "transliterate",
    provider: "sarvam",
    usageAmount: base.characters,
    // Same ₹20/10K list price as translation.
    costUsdMicros: translateCostUsdMicros(undefined, base.characters),
    latencyMs: base.latencyMs ?? null,
    metadata: {
      characters: base.characters,
      ...(base.languageCode ? { languageCode: base.languageCode } : {}),
    },
  });
}

/** Meter one language-identification invocation. */
export async function logIdentificationUsage(
  base: LanguageUsageEventBase & { characters: number },
): Promise<void> {
  await insertLanguageUsageEvent({
    orgId: base.orgId,
    kbId: base.kbId ?? null,
    agentId: base.agentId ?? null,
    // Reuse the TRANSLATION kind (the metering surface) with the identify model.
    kind: "TRANSLATION",
    model: "identify-language",
    provider: "sarvam",
    usageAmount: base.characters,
    costUsdMicros: identifyCostUsdMicros(base.characters),
    latencyMs: base.latencyMs ?? null,
    metadata: { characters: base.characters, operation: "identify" },
  });
}
