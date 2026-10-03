/**
 * src/modules/knowledge-bases/core/analytics-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Write + read from query_events table for per-KB usage analytics.
 *
 * The table doubles as the platform's query audit trail: every user prompt is
 * inserted at request time (status='pending' — counts toward daily quotas
 * immediately, so limits cannot be bypassed by aborting streams) and then
 * finalised with the AI-generated answer once the stream completes.
 *
 * WS-1.1 (usage-event spine): finalisation also persists the metering facts —
 * model, provider, prompt/completion token counts and estimated cost in
 * micro-dollars — taken from the provider's own usage report, never guessed.
 * Non-chat billable invocations (embedding batches during ingestion) append to
 * the separate usage_events table via logUsageEvent().
 */

import { query, execute, withTransaction } from "@/lib/db";
import { createHash } from "node:crypto";
import {
  estimateChatCostUsdMicros,
  estimateEmbeddingCostUsdMicros,
} from "@/modules/ai-core/model-catalog";
import { redactText, redactionEntries } from "@/lib/redact";

// ── Write ─────────────────────────────────────────────────────────────────────

export type QuerySurface = "workspace" | "embed" | "voice" | "search";
export type QueryStatus  = "pending" | "ok" | "error";

export async function logQueryEvent(opts: {
  kbId:        string | null;   // null for legacy document-scoped chat
  queryText:   string;
  sourceCount?: number;   // known after retrieval; 0 at request time
  latencyMs?:  number;
  sessionId?:  string;
  /** Audit context — org is resolved from the KB when not provided. */
  orgId?:      string | null;
  userId?:     string | null;
  surface?:    QuerySurface;
  /** Set for one-shot flows (search); chat streams finalise later. */
  answerText?: string | null;
  status?:     QueryStatus;
}): Promise<string | null> {
  try {
    // Resolve the owning org from kb → agent unless the caller already
    // knows it (embed context carries it from the validated API key).
    let orgId = opts.orgId ?? null;
    if (!orgId && opts.kbId) {
      const orgRows = await query<{ org_id: string }>(
        `SELECT a.org_id FROM agents a JOIN knowledge_bases kb ON kb.agent_id = a.id WHERE kb.id = $1`,
        [opts.kbId]
      );
      orgId = orgRows[0]?.org_id ?? null;
    }

    // WS-1.4: prompts are masked at write time. The original is kept in the
    // restricted query_raw column ONLY when redaction occurred; it leaves
    // that column solely through the audited super-admin reveal endpoint.
    const promptRedaction = redactText(opts.queryText);

    const rows = await query<{ id: string }>(
      `INSERT INTO query_events
         (kb_id, query_text, query_raw, source_count, latency_ms, session_id,
          org_id, user_id, answer_text, surface, status, redactions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        opts.kbId,
        promptRedaction.text,
        promptRedaction.changed ? opts.queryText : null,
        opts.sourceCount ?? 0,
        opts.latencyMs ?? null,
        opts.sessionId ?? null,
        orgId,
        opts.userId ?? null,
        opts.answerText != null ? truncate(redactText(opts.answerText).text, 8000) : null,
        opts.surface ?? "workspace",
        opts.status ?? (opts.answerText != null ? "ok" : "pending"),
        JSON.stringify(redactionEntries(promptRedaction.counts)),
      ]
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    // analytics must never break the request
    console.warn("[analytics] failed to log query event:", (err as Error).message);
    return null;
  }
}

/** Metering facts captured from the provider's usage report (WS-1.1). */
export type UsageMetering = {
  model:             string;
  provider:         string;
  promptTokens:     number;
  completionTokens: number;
  /** Estimated cost in micro-dollars; computed from the catalogue when absent. */
  costUsdMicros?:   number;
};

/**
 * Finalise a query event after the AI stream completes — persists the
 * generated answer (PII-masked) so platform admins can audit prompts AND
 * responses, plus the token/cost metering for the usage spine, and seals the
 * row into the per-org tamper-evident hash chain (WS-1.4).
 *
 * The finalise UPDATE and the hash-chain extension run inside ONE transaction
 * guarded by a per-org advisory lock, so concurrent finalises cannot fork the
 * chain. Finalising is idempotent-per-status: re-finalise (e.g. a retry)
 * recomputes and overwrites the same row's hash only while the row has not
 * been superseded; verified rows keep their chain position.
 */
export async function finalizeQueryEvent(
  eventId: string | null,
  opts: {
    answerText: string;
    status?:    QueryStatus;
    latencyMs?: number;
    sourceCount?: number;  // patched when retrieval completed after insert
    /** WS-1.1 metering (model, tokens, cost) from the provider usage report. */
    metering?:  UsageMetering | null;
    /** True when the user cancelled the stream; partial answer is kept. */
    cancelled?: boolean;
  }
): Promise<void> {
  if (!eventId) return;
  try {
    // An empty answer stays NULL — "no answer captured" is distinct from "".
    const answer = opts.answerText && opts.answerText.length > 0
      ? truncate(opts.answerText, 8000)
      : null;

    // WS-1.4: answers are masked like prompts; the original is kept in the
    // restricted answer_raw column only when redaction occurred.
    const answerRedaction = answer != null ? redactText(answer) : null;

    const metering = opts.metering ?? null;
    const costUsdMicros = metering
      ? metering.costUsdMicros ??
        estimateChatCostUsdMicros(metering.model, metering.promptTokens, metering.completionTokens)
      : 0;

    await withTransaction(async (tx) => {
      // Existing redaction counts (prompt masking happened at insert time)
      // are merged with the answer masking so the row reports both.
      const existing = await tx.query<{ redactions: string; query_raw: string | null }>(
        `SELECT redactions::text AS redactions, query_raw FROM query_events WHERE id = $1 FOR UPDATE`,
        [eventId],
      );
      const priorCounts: Record<string, number> = {};
      try {
        for (const entry of JSON.parse(existing.rows[0]?.redactions ?? "[]") as Array<{ type: string; count: number }>) {
          priorCounts[entry.type] = (priorCounts[entry.type] ?? 0) + entry.count;
        }
      } catch { /* malformed legacy JSON — start fresh */ }
      if (answerRedaction) {
        for (const [type, count] of Object.entries(answerRedaction.counts)) {
          priorCounts[type] = (priorCounts[type] ?? 0) + count;
        }
      }
      const mergedRedactions = JSON.stringify(redactionEntries(priorCounts));

      await tx.query(
        `UPDATE query_events
            SET answer_text       = $2,
                answer_raw        = $3,
                redactions        = $4::jsonb,
                status            = $5,
                latency_ms        = COALESCE($6, latency_ms),
                source_count      = COALESCE($7, source_count),
                model             = COALESCE($8, model),
                provider          = COALESCE($9, provider),
                prompt_tokens     = COALESCE($10, prompt_tokens),
                completion_tokens = COALESCE($11, completion_tokens),
                cost_usd_micros   = $12,
                cancelled         = $13
          WHERE id = $1`,
        [
          eventId,
          answerRedaction ? answerRedaction.text : answer,
          answerRedaction?.changed ? answer : null,
          mergedRedactions,
          opts.status ?? "ok",
          opts.latencyMs ?? null,
          opts.sourceCount ?? null,
          metering?.model ?? null,
          metering?.provider ?? null,
          metering?.promptTokens ?? null,
          metering?.completionTokens ?? null,
          costUsdMicros,
          opts.cancelled ?? false,
        ],
      );

      // ── WS-1.4: extend the per-org hash chain ────────────────────────────
      const row = (await tx.query<{ org_id: string | null }>(
        `SELECT org_id FROM query_events WHERE id = $1`,
        [eventId],
      )).rows[0];
      if (row?.org_id) {
        // Serialise chain extension per org — concurrent finalises queue here.
        await tx.query(`SELECT pg_advisory_xact_lock(hashtext('clara:qechain:' || $1))`, [row.org_id]);
        const prev = (await tx.query<{ row_hash: string | null }>(
          `SELECT row_hash FROM query_events
            WHERE org_id = $1 AND row_hash IS NOT NULL AND id <> $2
            ORDER BY created_at DESC, id DESC
            LIMIT 1`,
          [row.org_id, eventId],
        )).rows[0];

        // Canonical content — every field a tamperer would want to change.
        const canonical = await tx.query<{
          id: string; org_id: string; kb_id: string | null; user_id: string | null;
          query_text: string; answer_text: string | null; status: string;
          model: string | null; prompt_tokens: number; completion_tokens: number;
          created_at: string;
        }>(
          `SELECT id, org_id::text AS org_id, kb_id::text AS kb_id, user_id::text AS user_id,
                  query_text, answer_text, status, model,
                  prompt_tokens, completion_tokens, created_at::text AS created_at
             FROM query_events WHERE id = $1`,
          [eventId],
        );
        const c = canonical.rows[0];
        if (c) {
          const prevHash = prev?.row_hash ?? "";
          const payload = [
            prevHash,
            c.id, c.org_id, c.kb_id ?? "", c.user_id ?? "",
            c.query_text, c.answer_text ?? "", c.status,
            c.model ?? "", String(c.prompt_tokens), String(c.completion_tokens),
            c.created_at,
          ].join("\u001f");
          const rowHash = createHash("sha256").update(payload, "utf8").digest("hex");
          await tx.query(
            `UPDATE query_events SET prev_hash = $2, row_hash = $3 WHERE id = $1`,
            [eventId, prevHash, rowHash],
          );
        }
      }
    });
  } catch (err) {
    console.warn("[analytics] failed to finalise query event:", (err as Error).message);
  }
}

// ── WS-1.4: chain verification ────────────────────────────────────────────────

export type ChainBreak = {
  eventId: string;
  orgId: string | null;
  reason: "hash_mismatch" | "prev_hash_mismatch";
  expectedRowHash?: string;
  actualRowHash?: string;
};

export type ChainVerification = {
  orgId: string | null;
  rowsVerified: number;
  breaks: ChainBreak[];
};

/**
 * Recompute the per-org hash chain and report integrity breaks.
 * Pass an orgId to verify one org; omit to verify every org with hashed rows.
 */
export async function verifyQueryEventChain(orgId?: string): Promise<ChainVerification[]> {
  const orgs = await query<{ org_id: string }>(
    orgId
      ? `SELECT $1::uuid AS org_id`
      : `SELECT DISTINCT org_id FROM query_events WHERE row_hash IS NOT NULL AND org_id IS NOT NULL`,
    orgId ? [orgId] : undefined,
  );

  const results: ChainVerification[] = [];
  for (const { org_id } of orgs) {
    const rows = await query<{
      id: string; org_id: string; kb_id: string | null; user_id: string | null;
      query_text: string; answer_text: string | null; status: string;
      model: string | null; prompt_tokens: number; completion_tokens: number;
      created_at: string; prev_hash: string | null; row_hash: string;
    }>(
      `SELECT id, org_id::text AS org_id, kb_id::text AS kb_id, user_id::text AS user_id,
              query_text, answer_text, status, model,
              prompt_tokens, completion_tokens, created_at::text AS created_at,
              prev_hash, row_hash
         FROM query_events
        WHERE org_id = $1 AND row_hash IS NOT NULL
        ORDER BY created_at ASC, id ASC`,
      [org_id],
    );

    const breaks: ChainBreak[] = [];
    let prevHash = "";
    for (const row of rows) {
      const payload = [
        prevHash,
        row.id, row.org_id, row.kb_id ?? "", row.user_id ?? "",
        row.query_text, row.answer_text ?? "", row.status,
        row.model ?? "", String(row.prompt_tokens), String(row.completion_tokens),
        row.created_at,
      ].join("\u001f");
      const expected = createHash("sha256").update(payload, "utf8").digest("hex");
      if (expected !== row.row_hash) {
        breaks.push({
          eventId: row.id,
          orgId: row.org_id,
          reason: "hash_mismatch",
          expectedRowHash: expected,
          actualRowHash: row.row_hash,
        });
        // Continue with the stored hash so one bad row doesn't cascade.
        prevHash = row.row_hash;
      } else if (row.prev_hash !== prevHash) {
        breaks.push({
          eventId: row.id,
          orgId: row.org_id,
          reason: "prev_hash_mismatch",
        });
        prevHash = row.row_hash;
      } else {
        prevHash = row.row_hash;
      }
    }
    results.push({ orgId: org_id, rowsVerified: rows.length, breaks });
  }
  return results;
}

/**
 * WS-1.1: append one usage event for a NON-chat billable invocation
 * (an embedding batch during ingestion; TTS/OCR later). Append-only —
 * corrections are compensating rows, never updates.
 */
export async function logUsageEvent(opts: {
  kind:            "EMBEDDING" | "TTS" | "OCR" | "TRANSCRIPTION";
  model:           string;
  provider?:       string;
  orgId?:          string | null;
  kbId?:           string | null;
  agentId?:        string | null;
  documentId?:     string | null;
  promptTokens:    number;
  completionTokens?: number;
  latencyMs?:      number;
  metadata?:       Record<string, unknown>;
}): Promise<void> {
  if (opts.promptTokens <= 0) return;   // nothing billable to record
  try {
    const cost =
      opts.kind === "EMBEDDING"
        ? estimateEmbeddingCostUsdMicros(opts.model, opts.promptTokens)
        : 0;
    await execute(
      `INSERT INTO usage_events
         (org_id, kind, agent_id, kb_id, document_id, model, provider,
          prompt_tokens, completion_tokens, cost_usd_micros, latency_ms, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        opts.orgId ?? null,
        opts.kind,
        opts.agentId ?? null,
        opts.kbId ?? null,
        opts.documentId ?? null,
        opts.model,
        opts.provider ?? null,
        opts.promptTokens,
        opts.completionTokens ?? 0,
        cost,
        opts.latencyMs ?? null,
        JSON.stringify(opts.metadata ?? {}),
      ]
    );
  } catch (err) {
    // metering must never break the pipeline that is being metered
    console.warn("[analytics] failed to log usage event:", (err as Error).message);
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export type QueryEventRow = {
  date:        string;   // ISO date (YYYY-MM-DD)
  count:       number;
};

export type TopQuery = {
  queryText:   string;
  count:       number;
};

export type KbAnalytics = {
  totalQueries:    number;
  queriesThisWeek: number;
  queriesPerDay:   QueryEventRow[];   // last 30 days
  topQueries:      TopQuery[];        // top 10 by frequency
  avgLatencyMs:    number | null;
  avgSourceCount:  number | null;
};

export async function getKbAnalytics(kbId: string): Promise<KbAnalytics> {
  // The three aggregates are independent — run them concurrently instead of
  // sequentially (each serial round trip cost the full DB RTT).
  const [totalsRows, perDay, top] = await Promise.all([
    query<{ total: string; this_week: string; avg_latency: string | null; avg_sources: string | null }>(
      `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS this_week,
       AVG(latency_ms)   AS avg_latency,
       AVG(source_count) AS avg_sources
     FROM query_events
     WHERE kb_id = $1`,
      [kbId]
    ),
    // Queries per day — last 30 days
    query<{ day: string; cnt: string }>(
      `SELECT
       date_trunc('day', created_at AT TIME ZONE 'UTC')::date::text AS day,
       COUNT(*) AS cnt
     FROM query_events
     WHERE kb_id = $1
       AND created_at >= now() - interval '30 days'
     GROUP BY day
     ORDER BY day ASC`,
      [kbId]
    ),
    // Top 10 queries (by exact match, case-insensitive)
    query<{ query_text: string; cnt: string }>(
      `SELECT
       lower(trim(query_text)) AS query_text,
       COUNT(*) AS cnt
     FROM query_events
     WHERE kb_id = $1
     GROUP BY lower(trim(query_text))
     ORDER BY cnt DESC
     LIMIT 10`,
      [kbId]
    ),
  ]);
  const totals = totalsRows[0];

  return {
    totalQueries:    Number(totals?.total ?? 0),
    queriesThisWeek: Number(totals?.this_week ?? 0),
    queriesPerDay:   perDay.map((r) => ({ date: r.day, count: Number(r.cnt) })),
    topQueries:      top.map((r) => ({ queryText: r.query_text, count: Number(r.cnt) })),
    avgLatencyMs:    totals?.avg_latency != null ? Math.round(Number(totals.avg_latency)) : null,
    avgSourceCount:  totals?.avg_sources != null ? Math.round(Number(totals.avg_sources) * 10) / 10 : null,
  };
}

// ── Read: org-level metering aggregation (WS-1.1 dashboards) ─────────────────

export type OrgUsageMetering = {
  chat: {
    promptTokens:     number;
    completionTokens: number;
    costUsdMicros:    number;
    requests:         number;
  };
  embedding: {
    promptTokens:     number;
    costUsdMicros:    number;
    batches:          number;
  };
  /** Voice axis (ElevenLabs): TTS/STT/conversation usage + latency. */
  voice: {
    ttsCharacters:      number;
    sttAudioSeconds:    number;
    conversationSeconds: number;
    costUsdMicros:      number;
    ttsRequests:        number;
    sttRequests:        number;
    conversationCount:  number;
    /** Latency percentiles (ms) over TTS+STT invocations, null when empty. */
    latencyP50Ms:       number | null;
    latencyP95Ms:       number | null;
  };
  byModel: Array<{
    model:            string;
    requests:         number;
    promptTokens:     number;
    completionTokens: number;
    costUsdMicros:    number;
  }>;
};

/**
 * Aggregated token + cost metering for an organisation (last N days),
 * combining chat (query_events) and embedding (usage_events) usage.
 */
export async function getOrgUsageMetering(
  orgId: string,
  days = 30,
): Promise<OrgUsageMetering> {
  const window = `created_at >= now() - ($2 || ' days')::interval`;

  const [chatRow] = await query<{
    prompt_tokens: string; completion_tokens: string; cost_usd_micros: string; requests: string;
  }>(
    `SELECT
       COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(cost_usd_micros), 0)   AS cost_usd_micros,
       COUNT(*)                            AS requests
     FROM query_events
     WHERE org_id = $1 AND ${window}`,
    [orgId, String(days)]
  );

  const [embedRow] = await query<{
    prompt_tokens: string; cost_usd_micros: string; batches: string;
  }>(
    `SELECT
       COALESCE(SUM(prompt_tokens), 0)   AS prompt_tokens,
       COALESCE(SUM(cost_usd_micros), 0) AS cost_usd_micros,
       COUNT(*)                          AS batches
     FROM usage_events
     WHERE org_id = $1 AND kind = 'EMBEDDING' AND ${window}`,
    [orgId, String(days)]
  );

  // Voice axis (ElevenLabs): per-kind totals + latency percentiles from the
  // same usage_events spine (plan §12). prompt_tokens is the reused usage
  // column — characters for TTS, audio-seconds for STT, duration-seconds
  // for conversations.
  const [voiceRow] = await query<{
    tts_characters: string; stt_audio_seconds: string; conversation_seconds: string;
    cost_usd_micros: string; tts_requests: string; stt_requests: string;
    conversation_count: string; latency_p50: string | null; latency_p95: string | null;
  }>(
    `SELECT
       COALESCE(SUM(prompt_tokens) FILTER (WHERE kind = 'TTS'), 0)            AS tts_characters,
       COALESCE(SUM(prompt_tokens) FILTER (WHERE kind = 'TRANSCRIPTION'), 0)   AS stt_audio_seconds,
       COALESCE(SUM(prompt_tokens) FILTER (WHERE kind = 'CONVERSATION'), 0)   AS conversation_seconds,
       COALESCE(SUM(cost_usd_micros), 0)                                      AS cost_usd_micros,
       COUNT(*) FILTER (WHERE kind = 'TTS')                                   AS tts_requests,
       COUNT(*) FILTER (WHERE kind = 'TRANSCRIPTION')                         AS stt_requests,
       COUNT(*) FILTER (WHERE kind = 'CONVERSATION')                          AS conversation_count,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS latency_p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS latency_p95
     FROM usage_events
     WHERE org_id = $1 AND kind IN ('TTS','TRANSCRIPTION','CONVERSATION') AND ${window}`,
    [orgId, String(days)]
  );

  const byModel = await query<{
    model: string; requests: string; prompt_tokens: string; completion_tokens: string; cost_usd_micros: string;
  }>(
    `SELECT
       model,
       COUNT(*)                            AS requests,
       COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(cost_usd_micros), 0)   AS cost_usd_micros
     FROM query_events
     WHERE org_id = $1 AND model IS NOT NULL AND ${window}
     GROUP BY model
     ORDER BY cost_usd_micros DESC
     LIMIT 20`,
    [orgId, String(days)]
  );

  return {
    chat: {
      promptTokens:     Number(chatRow?.prompt_tokens ?? 0),
      completionTokens: Number(chatRow?.completion_tokens ?? 0),
      costUsdMicros:    Number(chatRow?.cost_usd_micros ?? 0),
      requests:         Number(chatRow?.requests ?? 0),
    },
    embedding: {
      promptTokens:     Number(embedRow?.prompt_tokens ?? 0),
      costUsdMicros:    Number(embedRow?.cost_usd_micros ?? 0),
      batches:          Number(embedRow?.batches ?? 0),
    },
    voice: {
      ttsCharacters:       Number(voiceRow?.tts_characters ?? 0),
      sttAudioSeconds:     Number(voiceRow?.stt_audio_seconds ?? 0),
      conversationSeconds: Number(voiceRow?.conversation_seconds ?? 0),
      costUsdMicros:       Number(voiceRow?.cost_usd_micros ?? 0),
      ttsRequests:         Number(voiceRow?.tts_requests ?? 0),
      sttRequests:         Number(voiceRow?.stt_requests ?? 0),
      conversationCount:   Number(voiceRow?.conversation_count ?? 0),
      latencyP50Ms:        voiceRow?.latency_p50 != null ? Math.round(Number(voiceRow.latency_p50)) : null,
      latencyP95Ms:        voiceRow?.latency_p95 != null ? Math.round(Number(voiceRow.latency_p95)) : null,
    },
    byModel: byModel.map((r) => ({
      model:            r.model,
      requests:         Number(r.requests),
      promptTokens:     Number(r.prompt_tokens),
      completionTokens: Number(r.completion_tokens),
      costUsdMicros:    Number(r.cost_usd_micros),
    })),
  };
}
