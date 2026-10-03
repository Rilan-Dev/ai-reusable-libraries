/**
 * src/modules/ai-governance/core/entitlements-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Subscription-plan AI entitlement resolution.
 *
 * Entitlements are modelled at PLAN level (subscription_plans) and applied to
 * every version of that plan. When no explicit plan_ai_* rows exist (pre-migration
 * boot), capabilities fall back to the legacy plan columns (voice_enabled) so
 * entitlement gating never changes existing behaviour before the data migration.
 */

import { query } from "@/lib/db";
import type { AICapability, GovernanceProviderId, PlanAIEntitlements } from "./types";

type Row = Record<string, unknown>;

const PROVIDER_IDS: GovernanceProviderId[] = ["openai", "gemini", "sarvam", "elevenlabs"];

/** Resolve the effective AI entitlements for an organisation's plan. */
export async function resolvePlanAIEntitlements(orgId: string): Promise<PlanAIEntitlements> {
  const rows = await query<Row>(
    `SELECT sp.id AS plan_id, sp.name AS plan_name, sp.voice_enabled,
            os.status AS sub_status,
            os.current_period_end,
            pac.capability, pac.enabled AS cap_enabled,
            ppe.provider_id AS ent_provider, ppe.allowed AS ent_allowed,
            pme.provider_id AS m_provider, pme.capability AS m_capability,
            pme.kind AS m_kind, pme.model_id AS m_model, pme.allowed AS m_allowed
       FROM org_subscriptions os
       JOIN subscription_plans sp ON sp.id = os.plan_id
       LEFT JOIN plan_ai_capabilities pac ON pac.plan_id = sp.id
       LEFT JOIN plan_ai_provider_entitlements ppe ON ppe.plan_id = sp.id
       LEFT JOIN plan_ai_model_entitlements pme ON pme.plan_id = sp.id
      WHERE os.org_id = $1
      ORDER BY os.updated_at DESC
      LIMIT 200`,
    [orgId],
  );

  if (rows.length === 0) {
    // No subscription → free tier entitlements.
    const free = await query<Row>(
      `SELECT sp.id AS plan_id, sp.name AS plan_name, sp.voice_enabled,
              pac.capability, pac.enabled AS cap_enabled,
              ppe.provider_id AS ent_provider, ppe.allowed AS ent_allowed,
              pme.provider_id AS m_provider, pme.capability AS m_capability,
              pme.kind AS m_kind, pme.model_id AS m_model, pme.allowed AS m_allowed
         FROM subscription_plans sp
         LEFT JOIN plan_ai_capabilities pac ON pac.plan_id = sp.id
         LEFT JOIN plan_ai_provider_entitlements ppe ON ppe.plan_id = sp.id
         LEFT JOIN plan_ai_model_entitlements pme ON pme.plan_id = sp.id
        WHERE sp.id = 'free'`,
    );
    return toEntitlements(free.length > 0 ? free : [], {
      planId: "free",
      planName: "Free",
      voiceEnabled: false,
    });
  }

  const head = rows[0];
  // Standing check (mirrors plan-guard.ts): expired/past_due → free entitlements.
  const end = head.current_period_end ? new Date(String(head.current_period_end)).getTime() : null;
  const expired = end !== null && end < Date.now();
  const goodStanding = (head.sub_status === "active" || head.sub_status === "trialing") && !expired;
  if (!goodStanding) {
    const free = await query<Row>(
      `SELECT sp.id AS plan_id, sp.name AS plan_name, sp.voice_enabled,
              pac.capability, pac.enabled AS cap_enabled,
              ppe.provider_id AS ent_provider, ppe.allowed AS ent_allowed,
              pme.provider_id AS m_provider, pme.capability AS m_capability,
              pme.kind AS m_kind, pme.model_id AS m_model, pme.allowed AS m_allowed
         FROM subscription_plans sp
         LEFT JOIN plan_ai_capabilities pac ON pac.plan_id = sp.id
         LEFT JOIN plan_ai_provider_entitlements ppe ON ppe.plan_id = sp.id
         LEFT JOIN plan_ai_model_entitlements pme ON pme.plan_id = sp.id
        WHERE sp.id = 'free'`,
    );
    return toEntitlements(free.length > 0 ? free : [], {
      planId: String(head.plan_id),
      planName: String(head.plan_name),
      voiceEnabled: Boolean(head.voice_enabled),
    });
  }

  return toEntitlements(rows, {
    planId: String(head.plan_id),
    planName: String(head.plan_name),
    voiceEnabled: Boolean(head.voice_enabled),
  });
}

function toEntitlements(
  rows: Row[],
  fallback: { planId: string; planName: string; voiceEnabled: boolean },
): PlanAIEntitlements {
  const capabilities: PlanAIEntitlements["capabilities"] = {};
  const allowedProviders: PlanAIEntitlements["allowedProviders"] = {};
  const modelExceptions: PlanAIEntitlements["modelExceptions"] = [];

  for (const row of rows) {
    if (row.capability != null) {
      capabilities[String(row.capability) as AICapability] = Boolean(row.cap_enabled);
    }
    if (row.ent_provider != null && PROVIDER_IDS.includes(String(row.ent_provider) as GovernanceProviderId)) {
      allowedProviders[String(row.ent_provider) as GovernanceProviderId] = Boolean(row.ent_allowed);
    }
    if (row.m_provider != null && row.m_model != null) {
      modelExceptions.push({
        providerId: String(row.m_provider) as GovernanceProviderId,
        capability: String(row.m_capability) as AICapability,
        kind: String(row.m_kind) as PlanAIEntitlements["modelExceptions"][number]["kind"],
        modelId: String(row.m_model),
        allowed: Boolean(row.m_allowed),
      });
    }
  }

  // Legacy fallback: no explicit capability rows → derive from voice_enabled
  // so gating matches pre-migration behaviour exactly (dual-read Stage H).
  if (!("chat" in capabilities)) capabilities.chat = true;
  if (!("voice_chat" in capabilities)) capabilities.voice_chat = fallback.voiceEnabled;
  if (!("realtime_voice" in capabilities)) capabilities.realtime_voice = fallback.voiceEnabled;

  // Legacy fallback: no explicit provider rows → all providers allowed
  // (matches the pre-migration posture of no plan-level provider restriction).
  if (Object.keys(allowedProviders).length === 0) {
    for (const p of PROVIDER_IDS) allowedProviders[p] = true;
  }

  return {
    planId: fallback.planId,
    planName: fallback.planName,
    capabilities,
    allowedProviders,
    modelExceptions,
  };
}
