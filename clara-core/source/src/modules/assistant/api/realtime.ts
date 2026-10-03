/**
 * src/modules/assistant/api/realtime.ts
 * Creates an ephemeral OpenAI Realtime session.
 */

import { NextRequest, NextResponse } from "next/server";
import { policyFromResolvedConfig, speechRecognitionLanguage } from "@/modules/assistant/core/language-policy";
import { resolveLanguagePreferences } from "@/modules/assistant/core/config";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { planGuard } from "@/lib/plan-guard";
import { hit, rateLimitResponse, REALTIME_SESSION_RATE } from "@/lib/rate-limit";
import { getAssistantConfigByKb, getKnowledgeBaseById, getKnowledgeBaseDocumentTitles } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { AIConfigResolutionError, resolveAIConfig } from "@/modules/ai-core/resolve";
import { resolveVoiceConfig } from "@/modules/voice-core/resolve";
import { isSupportedOpenAIRealtimeVoice } from "./openai-catalog";
import { buildOpenAIRealtimeSession, createOpenAIRealtimeClientSecret } from "./openai-realtime";

// Legacy document mode only. Unset → no cap (provider default "inf"); the
// spoken audio counts against this limit, so a small cap truncates answers.
const VOICE_MAX_RESPONSE_TOKENS: number | "inf" = (() => {
  const value = Number(process.env.OPENAI_REALTIME_MAX_TOKENS);
  return Number.isFinite(value) && value > 0 ? value : "inf";
})();
const VOICE_VAD = {
  type: "server_vad",
  threshold: Number(process.env.OPENAI_REALTIME_VAD_THRESHOLD ?? 0.5),
  prefix_padding_ms: Number(process.env.OPENAI_REALTIME_VAD_PREFIX_MS ?? 300),
  silence_duration_ms: Number(process.env.OPENAI_REALTIME_VAD_SILENCE_MS ?? 700),
  create_response: false,
} as const;
const TRANSCRIPTION_MODEL = process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe";
const DEFAULT_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1-mini";
const DEFAULT_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin";

export async function postRealtimeSession(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const kbId = typeof body?.kbId === "string" ? body.kbId.trim() : null;
    const requestedRagMode = typeof body?.ragMode === "string" ? body.ragMode : "hybrid";

    let instructions: string;
    let voice: string;
    let maxTokens: number | "inf";
    let transcriptionModel: string;
    let transcriptionLanguage: string | undefined;
    let toolDescription: string;
    let model: string;

    if (kbId) {
      await ensureMigrated();
      const kb = await getKnowledgeBaseById(kbId);
      if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });

      // ── Plan limit: voice must be enabled on the org's plan ──────────────
      // Runs BEFORE the assistant-config lookup so plan gating is always the
      // first failure a free-plan org sees.
      const orgRows = await dbQuery<{ org_id: string }>(
        `SELECT a.org_id FROM agents a JOIN knowledge_bases kb2 ON kb2.agent_id = a.id WHERE kb2.id = $1`,
        [kbId]
      );
      const orgId = orgRows[0]?.org_id ?? null;

      // ── Phase 6.4: realtime session rate limit (10 / hour / org) ─────────
      // Ephemeral session minting is expensive (provider round-trip + a
      // client secret), so it gets its own much tighter budget than chat.
      {
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
          ?? request.headers.get("x-real-ip") ?? "unknown";
        const gate = hit(`realtime:${orgId ? `org:${orgId}` : `ip:${ip}`}`, REALTIME_SESSION_RATE.limit, REALTIME_SESSION_RATE.windowMs);
        if (!gate.allowed) {
          const rl = rateLimitResponse(gate.retryAfterSec, "Voice session limit reached for this organisation. Please try again later.");
          return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
        }
      }

      if (orgId) {
        const voiceGuard = await planGuard(orgId, "voice");
        if (!voiceGuard.allowed) {
          const blocked = voiceGuard as { reason: string };
          return NextResponse.json(
            { error: "plan_limit_exceeded", code: "voice_not_enabled", message: blocked.reason },
            { status: 402 }
          );
        }
      }

      const [config, documentTitles] = await Promise.all([
        getAssistantConfigByKb(kbId),
        getKnowledgeBaseDocumentTitles(kbId),
      ]);
      if (!config) return NextResponse.json({ error: "AssistantConfig not found for this knowledge base" }, { status: 500 });

          // scope:"draft" — the authenticated agent preview resolves against
    // the CURRENT Main-branch draft instead of the immutable published
    // version (KB overrides apply; the LIVE collection is searched).
      const resolved = await resolveAIConfig({ kbId, surface: "realtime", ...(body?.scope === "draft" ? { preferDraft: true } : {}) });
      // ── Voice-axis transport gate ────────────────────────────────────────
      // The OpenAI Realtime transport is selected by the VOICE axis
      // (realtime purpose), not the brain provider: an org may run a Sarvam
      // or Gemini brain while the realtime voice assistant runs on OpenAI
      // (production incident 2026-09-21: a Sarvam brain made this route 409
      // even though the org explicitly selected OpenAI realtime voice).
      // The voice/model values come from the voice-axis resolver, which
      // validates every fallback against the OpenAI Realtime contract.
      const voiceResolved = await resolveVoiceConfig({ kbId, surface: "realtime", ...(body?.scope === "draft" ? { preferDraft: true } : {}) });
      if (voiceResolved.realtimeProvider !== "openai") {
        return NextResponse.json({
          error: `OpenAI Realtime is not the resolved realtime voice provider for this knowledge base (resolved: ${voiceResolved.realtimeProvider}).`,
          provider: voiceResolved.realtimeProvider,
        }, { status: 409 });
      }

      instructions = buildSystemPrompt(config, { kbName: kb.name, kbDescription: kb.description, documentCount: documentTitles.length, documentTitles, surface: "realtime" });
      voice = voiceResolved.openai?.voiceId ?? DEFAULT_REALTIME_VOICE;
      if (!isSupportedOpenAIRealtimeVoice(voice)) {
        return NextResponse.json({ error: `Unsupported OpenAI Realtime voice: ${voice}` }, { status: 400 });
      }
      maxTokens = resolved.realtimeMaxOutputTokens ?? "inf";
      transcriptionModel = voiceResolved.openai?.transcriptionModel ?? TRANSCRIPTION_MODEL;
      // Language policy: pinned only for a single reply language; otherwise
      // auto-detect (forcing the default transcribed allowed languages wrong).
      transcriptionLanguage = speechRecognitionLanguage(policyFromResolvedConfig({
        defaultLanguage: config.defaultLanguage,
        allowedLanguages: resolved.allowedLanguages ?? config.allowedLanguages,
        assistantConfig: { alwaysRespondIn: config.alwaysRespondIn },
      })) ?? undefined;
      model = voiceResolved.openai?.realtimeModel ?? DEFAULT_REALTIME_MODEL;
      toolDescription = `Retrieve grounded evidence from the "${kb.name}" knowledge base. Use kbId for KB-wide search, documentId only when the user explicitly scopes to one document, and pass ragMode=${requestedRagMode} so the server can use classic, hybrid, or agentic retrieval.`;
    } else {
      const languagePreferences = resolveLanguagePreferences({
        assistant: typeof body?.language === "string" ? body.language : undefined,
        customer: Array.isArray(body?.languages) ? body.languages as string[] : undefined,
      });
      instructions = process.env.OPENAI_REALTIME_INSTRUCTIONS ?? "You are Clara, a natural voice AI assistant. Use rag_search for factual or domain-specific questions and answer those questions only from returned knowledge-base evidence. If rag_search returns no useful evidence, do not invent domain facts; briefly explain that the configured knowledge base does not contain enough information. Ordinary greetings, thanks, pleasantries, and simple conversation should be answered naturally without requiring a knowledge-base hit. Be concise, warm, and professionally supportive.";
      voice = process.env.OPENAI_REALTIME_VOICE ?? DEFAULT_REALTIME_VOICE;
      if (!isSupportedOpenAIRealtimeVoice(voice)) return NextResponse.json({ error: `Unsupported OpenAI Realtime voice: ${voice}` }, { status: 400 });
      maxTokens = VOICE_MAX_RESPONSE_TOKENS;
      transcriptionModel = TRANSCRIPTION_MODEL;
      transcriptionLanguage = languagePreferences.assistant;
      model = DEFAULT_REALTIME_MODEL;
      toolDescription = "Retrieve relevant snippets from the active document. Call this whenever the user asks a question that needs specific information from it.";
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not set on server" }, { status: 500 });

    const tools = [{
      type: "function" as const,
      name: "rag_search",
      description: toolDescription,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The user's question in natural language." },
          kbId: { type: "string", description: "Knowledge base identifier for KB-wide retrieval." },
          documentId: { type: "string", description: "Optional document identifier when search should be restricted to a single document." },
          ragMode: { type: "string", enum: ["classic", "hybrid", "agentic"], description: "Retrieval mode to request from the server." },
        },
        required: ["query"],
      },
    }];

    const realtimeSession = buildOpenAIRealtimeSession({
      model,
      voice,
      instructions,
      tools,
      toolChoice: "auto",
      maxOutputTokens: maxTokens,
      turnDetection: VOICE_VAD,
      transcription: { model: transcriptionModel, language: transcriptionLanguage },
    });

    const result = await createOpenAIRealtimeClientSecret({ apiKey, session: realtimeSession });
    if (!result.ok) return NextResponse.json({ error: result.errorText || "Failed to create OpenAI Realtime session" }, { status: 500 });

    return NextResponse.json({
      ...result.data,
      model,
      voice,
      turn_detection: VOICE_VAD,
      input_audio_transcription: { model: transcriptionModel, language: transcriptionLanguage },
      kbId: kbId ?? null,
      provider: "openai",
      ragMode: requestedRagMode,
    });
  } catch (error) {
    console.error("[realtime] postRealtimeSession:", error);
    if (error instanceof AIConfigResolutionError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
