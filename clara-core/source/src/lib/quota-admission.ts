/**
 * src/lib/quota-admission.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * WS-1.2: atomic quota admission for billable query routes.
 *
 * The old flow was guard-then-insert:
 *     planGuard(orgId, "requests")  →  COUNT(query_events …)
 *     …handler runs…
 *     logQueryEvent(...)            →  INSERT query_events
 * Two concurrent requests could both pass the COUNT before either INSERT
 * landed — with one credit left, both were admitted (a TOCTOU race).
 *
 * admitQueryEvent() closes the race in ONE transaction:
 *   1. pg_advisory_xact_lock(hash(org_id))   — serialise admissions per org
 *   2. resolve the org's effective plan limits (same tx)
 *   3. COUNT the rolling-24h window
 *   4. refuse (402 contract) OR insert the pending query_event
 *   5. commit — the next concurrent request now sees the committed row
 *
 * The insert IS the admission: quota state and the audit/metering row can no
 * longer diverge, and a 100-request burst against one remaining credit admits
 * exactly one request.
 *
 * It also implements the 80% soft-warning contract: when the admitted request
 * crosses NEAR_LIMIT_PCT of the plan's daily limit, the result carries a
 * warning the caller streams to the client as a dismissible banner event.
 */

import { withTransaction } from "@/lib/db";
import { NextResponse } from "next/server";
import { resolveOrgPlanLimits, NEAR_LIMIT_PCT } from "@/lib/plan-guard";
import type { QuerySurface, QueryStatus } from "@/modules/knowledge-bases/core/analytics-db";
import { redactText, redactionEntries } from "@/lib/redact";

export type QuotaWarning = {
  limitKey: "max_req_day";
  used:     number;
  limit:    number;
  pct:      number;
};

export type AdmissionDenied = {
  admitted: false;
  /** 402 contract fields (plan_limit_exceeded). */
  reason:   string;
  limitKey: string;
  current:  number;
  limit:    number;
};

export type AdmissionGranted = {
  admitted: true;
  /** The pending query_events row — finalise it when the stream completes. */
  eventId:  string | null;
  /** Soft warning when usage crossed 80% of the daily limit. */
  warning:  QuotaWarning | null;
  used:     number;
  limit:    number;
};

export type AdmissionResult = AdmissionDenied | AdmissionGranted;

export type AdmitQueryEventInput = {
  orgId:      string | null;
  /** NULL for legacy document-scoped chat (Mode B) — org attribution only. */
  kbId:       string | null;
  queryText:  string;
  sessionId?: string;
  userId?:    string | null;
  surface?:   QuerySurface;
  /** One-shot flows (search) pass the answer/status at admission time. */
  answerText?: string | null;
  status?:     QueryStatus;
  sourceCount?: number;
  latencyMs?:   number;
};

/** Advisory-lock SQL: serialises quota admissions per org. hashtext()
 *  namespaces the lock under a constant so it cannot collide with other
 *  advisory-lock users (e.g. the WS-1.4 hash-chain lock). */
const ORG_QUOTA_LOCK_SQL = `SELECT pg_advisory_xact_lock(hashtext('clara:quota:' || $1))`;

export async function admitQueryEvent(input: AdmitQueryEventInput): Promise<AdmissionResult> {
  const { orgId, kbId, queryText } = input;

  // No org context (e.g. a dangling KB) — audit-only insert, no quota.
  if (!orgId) {
    const { logQueryEvent } = await import("@/modules/knowledge-bases/core/analytics-db");
    const eventId = await logQueryEvent({
      kbId,
      queryText,
      sessionId: input.sessionId,
      orgId: null,
      userId: input.userId ?? null,
      surface: input.surface,
      answerText: input.answerText,
      status: input.status,
      sourceCount: input.sourceCount,
      latencyMs: input.latencyMs,
    });
    return { admitted: true, eventId, warning: null, used: 0, limit: 0 };
  }

  try {
    return await withTransaction(async (tx) => {
      // 1. Serialise admissions for this org — concurrent requests block here.
      await tx.query(ORG_QUOTA_LOCK_SQL, [orgId]);

      // 2. Effective limits (same tx — a plan change mid-flight stays consistent).
      const limits = await resolveOrgPlanLimits(orgId, {
        query: async <T extends { [key: string]: unknown }>(sql: string, params?: unknown[]) => {
          const res = await tx.query(sql, params);
          return res.rows as T[];
        },
      });

      // 3. Rolling-24h window count (unchanged semantics from planGuard).
      const countRes = await tx.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
           FROM query_events
          WHERE org_id = $1
            AND created_at >= now() - INTERVAL '24 hours'`,
        [orgId],
      );
      const current = countRes.rows[0]?.count ?? 0;

      // 4. Unlimited plans: admit + insert (audit & metering still apply).
      if (limits.max_req_day === -1) {
        const eventId = await insertPendingEvent(tx, input, orgId);
        return { admitted: true, eventId, warning: null, used: current + 1, limit: -1 } satisfies AdmissionGranted;
      }

      // 5. Over the limit → refuse BEFORE any retrieval/LLM spend.
      if (current >= limits.max_req_day) {
        // WS-1.4: the refusal itself is audited (fire-and-forget).
        try {
          const { writeAuditLog } = await import("@/modules/auth/core/db");
          void writeAuditLog({
            orgId,
            action: "quota.denied",
            resourceType: "query_event",
            newData: {
              limitKey: "max_req_day",
              current,
              limit: limits.max_req_day,
              planId: limits.plan_id,
              downgraded: limits.downgraded,
              kbId,
              surface: input.surface ?? "workspace",
            },
          }).catch(() => undefined);
        } catch { /* audit import failure must not affect the refusal */ }
        return {
          admitted: false,
          reason:
            `Daily request limit reached — your ${limits.plan_name} plan allows ` +
            `${limits.max_req_day.toLocaleString()} requests per day (you've used ` +
            `${current.toLocaleString()} in the last 24 hours). The counter rolls off ` +
            `continuously as requests age out.` +
            (limits.downgraded ? " Your subscription is not active, so free-plan limits apply." : "") +
            ` Upgrade your plan for more requests.`,
          limitKey: "max_req_day",
          current,
          limit: limits.max_req_day,
        } satisfies AdmissionDenied;
      }

      // 6. Admit: the insert IS the admission (atomic with the count above).
      const eventId = await insertPendingEvent(tx, input, orgId);
      const used = current + 1;

      // 7. 80% soft warning — fires on the crossing request, not every one.
      let warning: QuotaWarning | null = null;
      const warnThreshold = Math.floor((NEAR_LIMIT_PCT / 100) * limits.max_req_day);
      if (used === warnThreshold) {
        warning = {
          limitKey: "max_req_day",
          used,
          limit: limits.max_req_day,
          pct: NEAR_LIMIT_PCT,
        };
      }

      return { admitted: true, eventId, warning, used, limit: limits.max_req_day } satisfies AdmissionGranted;
    });
  } catch (err) {
    // Admission itself failed (DB outage). Fail OPEN by default to match
    // planGuard's documented rationale — the handler's own DB writes would
    // fail anyway. PLAN_GUARD_FAIL_MODE=closed makes this a hard refusal.
    console.error("[quota-admission] error:", err);
    if (process.env.PLAN_GUARD_FAIL_MODE?.toLowerCase() === "closed") {
      return {
        admitted: false,
        reason: "Plan limits could not be verified right now. Please try again shortly.",
        limitKey: "plan_guard_unavailable",
        current: 0,
        limit: 0,
      } satisfies AdmissionDenied;
    }

    // Fail-open path still audits via the non-transactional logger.
    const { logQueryEvent } = await import("@/modules/knowledge-bases/core/analytics-db");
    const eventId = await logQueryEvent({
      kbId,
      queryText,
      sessionId: input.sessionId,
      orgId,
      userId: input.userId ?? null,
      surface: input.surface,
      answerText: input.answerText,
      status: input.status,
      sourceCount: input.sourceCount,
      latencyMs: input.latencyMs,
    });
    return { admitted: true, eventId, warning: null, used: 0, limit: 0 };
  }
}

/** Insert the pending query_events row on the transaction client. */
async function insertPendingEvent(
  tx: { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> },
  input: AdmitQueryEventInput,
  orgId: string,
): Promise<string | null> {
  const status: QueryStatus = input.status ?? (input.answerText != null ? "ok" : "pending");
  // WS-1.4: the prompt is masked at write time; the original is kept in the
  // restricted query_raw column only when redaction occurred.
  const promptRedaction = redactText(input.queryText);
  const res = await tx.query(
    `INSERT INTO query_events
       (kb_id, query_text, query_raw, source_count, latency_ms, session_id,
        org_id, user_id, answer_text, surface, status, redactions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      input.kbId,
      promptRedaction.text,
      promptRedaction.changed ? input.queryText : null,
      input.sourceCount ?? 0,
      input.latencyMs ?? null,
      input.sessionId ?? null,
      orgId,
      input.userId ?? null,
      input.answerText != null ? input.answerText.slice(0, 8000) : null,
      input.surface ?? "workspace",
      status,
      JSON.stringify(redactionEntries(promptRedaction.counts)),
    ],
  );
  return (res.rows[0] as { id: string } | undefined)?.id ?? null;
}

/**
 * Build the 402 response body for a denied admission (plan_limit_exceeded
 * contract — machine-readable code, friendly message, upgrade CTA fields).
 */
export function admissionDeniedResponse(denied: AdmissionDenied): NextResponse {
  return NextResponse.json(
    {
      error:    "plan_limit_exceeded",
      code:     "plan_limit_exceeded",
      message:  denied.reason,
      limitKey: denied.limitKey,
      current:  denied.current,
      limit:    denied.limit,
      upgradeUrl: "/pricing",
    },
    { status: 402 },
  );
}
