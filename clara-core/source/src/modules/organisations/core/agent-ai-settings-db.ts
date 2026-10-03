import { query, queryOne } from "@/lib/db";
import type { AIProvider } from "@/modules/ai-core/config-types";
import type { VoiceProvider } from "@/modules/voice-core/types";
import type { PatchAgentAISettingsInput, AgentAISettings, AgentLanguage, AgentVoice } from "./agent-ai-types";

type Row = Record<string, unknown>;
function provider(value: unknown): AIProvider | null { return value === "openai" || value === "gemini" || value === "sarvam" ? value : null; }
function voiceProvider(value: unknown): VoiceProvider | null { return value === "openai" || value === "gemini" || value === "elevenlabs" || value === "sarvam" ? value : null; }
function language(row: Row): AgentLanguage { return { id: String(row.id), orgId: String(row.org_id), code: String(row.code), name: String(row.name), nativeName: row.native_name == null ? null : String(row.native_name), enabled: Boolean(row.enabled) }; }
function voice(row: Row): AgentVoice { return { id: String(row.id), orgId: String(row.org_id), provider: voiceProvider(row.provider) ?? "openai", voiceId: String(row.voice_id), name: String(row.name), enabled: Boolean(row.enabled), metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {} }; }

export async function getAgentAISettings(agentId: string): Promise<AgentAISettings | null> {
  const base = await queryOne<Row>("SELECT * FROM agent_ai_settings WHERE agent_id = $1", [agentId]);
  if (!base) return null;
  const orgId = String(base.org_id);
  const [languageRows, voiceRows] = await Promise.all([
    query<Row>(`SELECT l.* FROM agent_language_assignments a JOIN organisation_languages l ON l.id = a.language_id AND l.org_id = a.org_id WHERE a.agent_id = $1 AND a.org_id = $2 ORDER BY l.name`, [agentId, orgId]),
    query<Row>(`SELECT v.* FROM agent_voice_assignments a JOIN organisation_voices v ON v.id = a.voice_id AND v.org_id = a.org_id WHERE a.agent_id = $1 AND a.org_id = $2 ORDER BY v.name`, [agentId, orgId]),
  ]);
  return {
    id: String(base.id), agentId: String(base.agent_id), orgId,
    provider: provider(base.provider), voiceProvider: voiceProvider(base.voice_provider),
    voiceChatSttModel: base.voice_chat_stt_model == null ? null : String(base.voice_chat_stt_model),
    voiceChatTtsModel: base.voice_chat_tts_model == null ? null : String(base.voice_chat_tts_model),
    voiceChatVoiceId: base.voice_chat_voice_id == null ? null : String(base.voice_chat_voice_id),
    realtimeVoiceProvider: voiceProvider(base.realtime_voice_provider),
    realtimeLlmModel: base.realtime_llm_model == null ? null : String(base.realtime_llm_model),
    realtimeSttModel: base.realtime_stt_model == null ? null : String(base.realtime_stt_model),
    realtimeTtsModel: base.realtime_tts_model == null ? null : String(base.realtime_tts_model),
    realtimeVoiceId: base.realtime_voice_id == null ? null : String(base.realtime_voice_id),
    chatModel: base.chat_model == null ? null : String(base.chat_model), embeddingModel: base.embedding_model == null ? null : String(base.embedding_model),
    realtimeModel: base.realtime_model == null ? null : String(base.realtime_model), transcriptionModel: base.transcription_model == null ? null : String(base.transcription_model),
    defaultLanguageId: base.default_language_id == null ? null : String(base.default_language_id), defaultVoiceId: base.default_voice_id == null ? null : String(base.default_voice_id),
    languages: languageRows.map(language), voices: voiceRows.map(voice),
  };
}

export async function upsertAgentAISettings(agentId: string, orgId: string, input: PatchAgentAISettingsInput): Promise<AgentAISettings> {
  const current = await getAgentAISettings(agentId);
  const next = {
    provider: input.provider !== undefined ? input.provider : current?.provider ?? null,
    voiceProvider: input.voiceProvider !== undefined ? input.voiceProvider : current?.voiceProvider ?? null,
    voiceChatSttModel: input.voiceChatSttModel !== undefined ? input.voiceChatSttModel : current?.voiceChatSttModel ?? null,
    voiceChatTtsModel: input.voiceChatTtsModel !== undefined ? input.voiceChatTtsModel : current?.voiceChatTtsModel ?? null,
    voiceChatVoiceId: input.voiceChatVoiceId !== undefined ? input.voiceChatVoiceId : current?.voiceChatVoiceId ?? null,
    realtimeVoiceProvider: input.realtimeVoiceProvider !== undefined ? input.realtimeVoiceProvider : current?.realtimeVoiceProvider ?? null,
    realtimeLlmModel: input.realtimeLlmModel !== undefined ? input.realtimeLlmModel : current?.realtimeLlmModel ?? null,
    realtimeSttModel: input.realtimeSttModel !== undefined ? input.realtimeSttModel : current?.realtimeSttModel ?? null,
    realtimeTtsModel: input.realtimeTtsModel !== undefined ? input.realtimeTtsModel : current?.realtimeTtsModel ?? null,
    realtimeVoiceId: input.realtimeVoiceId !== undefined ? input.realtimeVoiceId : current?.realtimeVoiceId ?? null,
    chatModel: input.chatModel !== undefined ? input.chatModel : current?.chatModel ?? null,
    embeddingModel: input.embeddingModel !== undefined ? input.embeddingModel : current?.embeddingModel ?? null,
    realtimeModel: input.realtimeModel !== undefined ? input.realtimeModel : current?.realtimeModel ?? null,
    transcriptionModel: input.transcriptionModel !== undefined ? input.transcriptionModel : current?.transcriptionModel ?? null,
    defaultLanguageId: input.defaultLanguageId !== undefined ? input.defaultLanguageId : current?.defaultLanguageId ?? null,
    defaultVoiceId: input.defaultVoiceId !== undefined ? input.defaultVoiceId : current?.defaultVoiceId ?? null,
  };
  if (next.defaultLanguageId && input.languageIds !== undefined && !input.languageIds.includes(next.defaultLanguageId)) throw new Error("defaultLanguageId must be included in languageIds");
  if (next.defaultVoiceId && input.voiceIds !== undefined && !input.voiceIds.includes(next.defaultVoiceId)) throw new Error("defaultVoiceId must be included in voiceIds");

  const row = await queryOne<Row>(`INSERT INTO agent_ai_settings (agent_id, org_id, provider, voice_provider, voice_chat_stt_model, voice_chat_tts_model, voice_chat_voice_id, realtime_voice_provider, realtime_llm_model, realtime_stt_model, realtime_tts_model, realtime_voice_id, chat_model, embedding_model, realtime_model, transcription_model, default_language_id, default_voice_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    ON CONFLICT (agent_id) DO UPDATE SET org_id=EXCLUDED.org_id, provider=EXCLUDED.provider, voice_provider=EXCLUDED.voice_provider, voice_chat_stt_model=EXCLUDED.voice_chat_stt_model, voice_chat_tts_model=EXCLUDED.voice_chat_tts_model, voice_chat_voice_id=EXCLUDED.voice_chat_voice_id, realtime_voice_provider=EXCLUDED.realtime_voice_provider, realtime_llm_model=EXCLUDED.realtime_llm_model, realtime_stt_model=EXCLUDED.realtime_stt_model, realtime_tts_model=EXCLUDED.realtime_tts_model, realtime_voice_id=EXCLUDED.realtime_voice_id, chat_model=EXCLUDED.chat_model, embedding_model=EXCLUDED.embedding_model, realtime_model=EXCLUDED.realtime_model, transcription_model=EXCLUDED.transcription_model, default_language_id=EXCLUDED.default_language_id, default_voice_id=EXCLUDED.default_voice_id, updated_at=now() RETURNING *`,
    [agentId, orgId, next.provider, next.voiceProvider, next.voiceChatSttModel, next.voiceChatTtsModel, next.voiceChatVoiceId, next.realtimeVoiceProvider, next.realtimeLlmModel, next.realtimeSttModel, next.realtimeTtsModel, next.realtimeVoiceId, next.chatModel, next.embeddingModel, next.realtimeModel, next.transcriptionModel, next.defaultLanguageId, next.defaultVoiceId]);
  if (!row) throw new Error(`Failed to save agent AI settings for ${agentId}`);

  if (input.languageIds !== undefined) {
    await query("DELETE FROM agent_language_assignments WHERE agent_id = $1 AND org_id = $2", [agentId, orgId]);
    for (const languageId of [...new Set(input.languageIds)]) await query(`INSERT INTO agent_language_assignments (agent_id, org_id, language_id) SELECT $1,$2,l.id FROM organisation_languages l WHERE l.id=$3 AND l.org_id=$2 AND l.enabled=TRUE`, [agentId, orgId, languageId]);
  }
  if (input.voiceIds !== undefined) {
    await query("DELETE FROM agent_voice_assignments WHERE agent_id = $1 AND org_id = $2", [agentId, orgId]);
    for (const voiceId of [...new Set(input.voiceIds)]) await query(`INSERT INTO agent_voice_assignments (agent_id, org_id, voice_id) SELECT $1,$2,v.id FROM organisation_voices v WHERE v.id=$3 AND v.org_id=$2 AND v.enabled=TRUE`, [agentId, orgId, voiceId]);
  }

  const saved = await getAgentAISettings(agentId);
  if (!saved || saved.orgId !== orgId) throw new Error("Project AI settings tenant mismatch");
  if (saved.defaultLanguageId && !saved.languages.some((item) => item.id === saved.defaultLanguageId)) throw new Error("defaultLanguageId must reference an assigned language");
  if (saved.defaultVoiceId && !saved.voices.some((item) => item.id === saved.defaultVoiceId)) throw new Error("defaultVoiceId must reference an assigned voice");
  return saved;
}
