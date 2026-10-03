/**
 * src/modules/voice-core/realtime/latency-log.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One readable console line per voice turn — where the time went, from the
 * visitor finishing speaking to the first audio, plus the server's retrieval
 * stages (Server-Timing). Visible at the default console level so a tester
 * can copy it without enabling "Verbose".
 *
 *   [voice-latency] elevenlabs · first audio 2140 ms · speech→text 380 ·
 *   server before model 910 (config 12, admission 180, translation 0,
 *   retrieval 420) · first model word 1480 · text→speech 310
 */

import type { TurnStageLatencies } from "./latency-tracker";

type Telemetry = { latencies?: Partial<TurnStageLatencies> | null } | null | undefined;

const ms = (value: number | null | undefined) => (typeof value === "number" ? `${Math.round(value)} ms` : null);

export function formatVoiceTurnLatency(
  provider: string,
  telemetry: Telemetry,
  server?: Record<string, number> | null,
): string {
  const l = telemetry?.latencies ?? {};
  const parts: string[] = [];
  const ttfa = ms(l.ttfaMs);
  if (ttfa) parts.push(`first audio ${ttfa}`);
  const stt = ms(l.sttMs);
  if (stt) parts.push(`speech→text ${stt}`);
  if (server) {
    const stage = (key: string) => (typeof server[key] === "number" ? Math.round(server[key]!) : null);
    const detail = [
      ["metadata", stage("rag-metadata") ?? stage("metadata")],
      ["config", stage("rag-config") ?? stage("config")],
      ["admission", stage("rag-admission") ?? stage("admission")],
      ["translation", stage("rag-translation") ?? stage("translation")],
      ["retrieval", stage("rag-retrieval") ?? stage("retrieval")],
      ["graph", stage("rag-graph") ?? stage("graph")],
    ]
      .filter(([, value]) => value != null)
      .map(([label, value]) => `${label} ${value}`)
      .join(", ");
    const before = stage("pre-llm") ?? stage("rag-total") ?? stage("total");
    if (before != null || detail) parts.push(`server before model ${before ?? "?"} ms${detail ? ` (${detail})` : ""}`);
  }
  const rag = ms(l.ragMs);
  if (rag && !server) parts.push(`retrieval ${rag}`);
  const llm = ms(l.llmMs);
  if (llm) parts.push(`first model word ${llm}`);
  const tts = ms(l.ttsMs);
  if (tts) parts.push(`text→speech ${tts}`);
  return `[voice-latency] ${provider} · ${parts.length > 0 ? parts.join(" · ") : "no stages recorded"}`;
}

export function logVoiceTurnLatency(provider: string, telemetry: Telemetry, server?: Record<string, number> | null): void {
  console.info(formatVoiceTurnLatency(provider, telemetry, server));
}
