/**
 * src/modules/ai-governance/core/usage-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provider usage / quota / recharge-warning rollups.
 *
 * The authoritative metering spine is usage_events (append-only). This module
 * rolls the current billing period up into platform_ai_provider_usage (an
 * upsert-on-read cache) and derives recharge warnings from each provider's
 * monthly_budget_usd + warning_threshold_pct.
 */

import { query } from "@/lib/db";
import { getPlatformAIRegistry } from "./registry-db";
import type { GovernanceProviderId, ProviderUsageSummary } from "./types";

type Row = Record<string, unknown>;

export interface ProviderUsageReport {
  providerId: GovernanceProviderId;
  periodStart: string;
  requests: number;
  costUsd: number;
  monthlyBudgetUsd: number | null;
  usagePct: number | null;
  rechargeWarning: boolean;
}

/** Billing-period anchor: calendar month start (UTC). */
function currentPeriodStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Refresh + read the usage rollup for every provider for the current period.
 * usage_events carries TTS/STT/embedding/OCR spend; chat spend is metered in
 * query_events (cost columns) and is included so the report reflects the full
 * provider burn.
 */
export async function getProviderUsageReports(): Promise<ProviderUsageReport[]> {
  const periodStart = currentPeriodStart();
  const registry = await getPlatformAIRegistry();

  const rows = await query<Row>(
    `SELECT provider, count(*)::bigint AS requests, COALESCE(sum(cost_usd_micros), 0)::bigint AS cost_usd_micros
       FROM usage_events
      WHERE created_at >= $1::date AND provider IS NOT NULL
      GROUP BY provider
     UNION ALL
     SELECT 'openai' AS provider, count(*)::bigint, COALESCE(sum(cost_usd_micros), 0)::bigint
       FROM query_events
      WHERE created_at >= $1::date AND cost_usd_micros > 0`,
    [periodStart],
  );

  const byProvider = new Map<string, { requests: number; costUsdMicros: number }>();
  for (const row of rows) {
    const key = String(row.provider);
    const prev = byProvider.get(key) ?? { requests: 0, costUsdMicros: 0 };
    byProvider.set(key, {
      requests: prev.requests + Number(row.requests),
      costUsdMicros: prev.costUsdMicros + Number(row.cost_usd_micros),
    });
  }

  const reports: ProviderUsageReport[] = [];
  for (const provider of registry.providers) {
    const usage = byProvider.get(provider.providerId) ?? { requests: 0, costUsdMicros: 0 };
    const costUsd = usage.costUsdMicros / 1_000_000;
    const usagePct =
      provider.monthlyBudgetUsd != null && provider.monthlyBudgetUsd > 0
        ? Math.round((costUsd / provider.monthlyBudgetUsd) * 100)
        : null;
    const rechargeWarning =
      usagePct != null && usagePct >= provider.warningThresholdPct;

    // Upsert the rollup cache (best-effort — reporting must never fail on it).
    try {
      await query(
        `INSERT INTO platform_ai_provider_usage (provider_id, period_start, requests, cost_usd_micros, updated_at)
         VALUES ($1, $2::date, $3, $4, now())
         ON CONFLICT (provider_id, period_start) DO UPDATE
           SET requests = $3, cost_usd_micros = $4, updated_at = now()`,
        [provider.providerId, periodStart, usage.requests, usage.costUsdMicros],
      );
    } catch {
      // Rollup cache is best-effort only.
    }

    reports.push({
      providerId: provider.providerId,
      periodStart,
      requests: usage.requests,
      costUsd,
      monthlyBudgetUsd: provider.monthlyBudgetUsd,
      usagePct,
      rechargeWarning,
    });
  }
  return reports;
}

/** Usage for a single provider (provider detail workspace). */
export async function getProviderUsage(
  providerId: GovernanceProviderId,
): Promise<ProviderUsageSummary> {
  const periodStart = currentPeriodStart();
  const rows = await query<Row>(
    `SELECT requests::bigint AS requests, cost_usd_micros::bigint AS cost_usd_micros
       FROM platform_ai_provider_usage
      WHERE provider_id = $1 AND period_start = $2::date`,
    [providerId, periodStart],
  );
  const row = rows[0];
  return {
    providerId,
    periodStart,
    requests: row ? Number(row.requests) : 0,
    costUsdMicros: row ? Number(row.cost_usd_micros) : 0,
  };
}
