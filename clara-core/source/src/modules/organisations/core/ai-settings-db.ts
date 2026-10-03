import { queryOne } from "@/lib/db";
import type {
  AIProvider,
  OrgAISettings,
  PatchOrgAISettingsInput,
  ProviderScopedList,
} from "@/modules/ai-core/config-types";
import { isVoiceProvider, type VoiceProvider } from "@/modules/voice-core/types";

type Row = Record<string, unknown>;

function normalizeProviderList(input: unknown): AIProvider[] {
  if (!Array.isArray(input)) return ["openai", "gemini"];
  const values = input.filter(
    (value): value is AIProvider => value === "openai" || value === "gemini" || value === "sarvam",
  );
  return values.length > 0 ? values : ["openai", "gemini"];
}

function normalizeVoiceProviderList(input: unknown): VoiceProvider[] {
  if (!Array.isArray(input)) return ["openai", "gemini", "elevenlabs", "sarvam"];
  const values = input.filter((value): value is VoiceProvider => isVoiceProvider(value));
  return values.length > 0 ? values : ["openai", "gemini", "elevenlabs"];
}

function normalizeTranslationMode(input: unknown): "off" | "query" | "query+answer" {
  return input === "query" || input === "query+answer" ? input : "off";
}

function normalizeProviderScopedList(input: unknown): ProviderScopedList {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const record = input as Record<string, unknown>;
  const scoped: ProviderScopedList = {};
  for (const provider of ["openai", "gemini", "sarvam"] as const) {
    const values = record[provider];
    if (!Array.isArray(values)) continue;
    scoped[provider] = values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return scoped;
}

function toOrgAISettings(row: Row): OrgAISettings {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    defaultProvider:
      row.default_provider === "openai" || row.default_provider === "gemini" || row.default_provider === "sarvam"
        ? row.default_provider
        : null,
    allowedProviders: normalizeProviderList(row.allowed_providers),
    voiceProvider: isVoiceProvider(row.voice_provider) ? row.voice_provider : null,
    allowedVoiceProviders: normalizeVoiceProviderList(row.allowed_voice_providers),
    realtimeVoiceProvider: isVoiceProvider(row.realtime_voice_provider) ? row.realtime_voice_provider : null,
    elevenlabsTtsModel: typeof row.elevenlabs_tts_model === "string" ? row.elevenlabs_tts_model : null,
    elevenlabsSttModel: typeof row.elevenlabs_stt_model === "string" ? row.elevenlabs_stt_model : null,
    defaultElevenlabsVoice: typeof row.default_elevenlabs_voice === "string" ? row.default_elevenlabs_voice : null,
    sarvamTtsModel: typeof row.sarvam_tts_model === "string" ? row.sarvam_tts_model : null,
    sarvamSttModel: typeof row.sarvam_stt_model === "string" ? row.sarvam_stt_model : null,
    defaultSarvamSpeaker: typeof row.default_sarvam_speaker === "string" ? row.default_sarvam_speaker : null,
    translationMode: normalizeTranslationMode(row.translation_mode),
    allowedChatModels: normalizeProviderScopedList(row.allowed_chat_models),
    allowedEmbeddingModels: normalizeProviderScopedList(
      row.allowed_embedding_models,
    ),
    allowedRealtimeModels: normalizeProviderScopedList(
      row.allowed_realtime_models,
    ),
    allowedVoices: normalizeProviderScopedList(row.allowed_voices),
    defaultChatModel:
      typeof row.default_chat_model === "string"
        ? row.default_chat_model
        : null,
    defaultEmbeddingModel:
      typeof row.default_embedding_model === "string"
        ? row.default_embedding_model
        : null,
    defaultRealtimeModel:
      typeof row.default_realtime_model === "string"
        ? row.default_realtime_model
        : null,
    defaultTranscriptionModel:
      typeof row.default_transcription_model === "string"
        ? row.default_transcription_model
        : null,
    maxChatTokens:
      typeof row.max_chat_tokens === "number"
        ? row.max_chat_tokens
        : row.max_chat_tokens != null
          ? Number(row.max_chat_tokens)
          : null,
    maxRealtimeTokens:
      typeof row.max_realtime_tokens === "number"
        ? row.max_realtime_tokens
        : row.max_realtime_tokens != null
          ? Number(row.max_realtime_tokens)
          : null,
    maxTemperature:
      typeof row.max_temperature === "number"
        ? row.max_temperature
        : row.max_temperature != null
          ? Number(row.max_temperature)
          : null,
    enablePublicEmbed: Boolean(row.enable_public_embed),
    enableVoice: Boolean(row.enable_voice),
    enableRealtime: Boolean(row.enable_realtime),
    // Identity
    assistantName:
      typeof row.assistant_name === "string" ? row.assistant_name : null,
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    // Behaviour
    systemPrompt:
      typeof row.system_prompt === "string" ? row.system_prompt : null,
    welcomeMessage:
      typeof row.welcome_message === "string" ? row.welcome_message : null,
    outOfScopeReply:
      typeof row.out_of_scope_reply === "string"
        ? row.out_of_scope_reply
        : null,
    rules: Array.isArray(row.rules) ? row.rules : null,
    // Language
    defaultLanguage:
      typeof row.default_language === "string" ? row.default_language : null,
    allowedLanguages: Array.isArray(row.allowed_languages)
      ? row.allowed_languages
      : null,
    alwaysRespondIn:
      typeof row.always_respond_in === "string" ? row.always_respond_in : null,
    // Voice
    voiceId: typeof row.voice_id === "string" ? row.voice_id : null,
    voiceSpeed:
      typeof row.speed === "number"
        ? row.speed
        : row.speed != null
          ? Number(row.speed)
          : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getOrgAISettings(
  orgId: string,
): Promise<OrgAISettings | null> {
  const row = await queryOne<Row>(
    "SELECT * FROM org_ai_settings WHERE org_id = $1",
    [orgId],
  );
  return row ? toOrgAISettings(row) : null;
}

export async function upsertOrgAISettings(
  orgId: string,
  input: PatchOrgAISettingsInput,
): Promise<OrgAISettings> {
  const current = await getOrgAISettings(orgId);
  const next = {
    defaultProvider: input.defaultProvider ?? current?.defaultProvider ?? null,
    allowedProviders: input.allowedProviders ??
      current?.allowedProviders ?? ["openai", "gemini"],
    voiceProvider: input.voiceProvider !== undefined
      ? input.voiceProvider
      : (current?.voiceProvider ?? null),
    allowedVoiceProviders: input.allowedVoiceProviders ??
      current?.allowedVoiceProviders ?? ["openai", "gemini", "elevenlabs", "sarvam"],
    realtimeVoiceProvider: input.realtimeVoiceProvider !== undefined
      ? input.realtimeVoiceProvider
      : (current?.realtimeVoiceProvider ?? null),
    elevenlabsTtsModel: input.elevenlabsTtsModel !== undefined
      ? normalizeStringOrNull(input.elevenlabsTtsModel)
      : (current?.elevenlabsTtsModel ?? null),
    elevenlabsSttModel: input.elevenlabsSttModel !== undefined
      ? normalizeStringOrNull(input.elevenlabsSttModel)
      : (current?.elevenlabsSttModel ?? null),
    defaultElevenlabsVoice: input.defaultElevenlabsVoice !== undefined
      ? normalizeStringOrNull(input.defaultElevenlabsVoice)
      : (current?.defaultElevenlabsVoice ?? null),
    sarvamTtsModel: input.sarvamTtsModel !== undefined
      ? normalizeStringOrNull(input.sarvamTtsModel)
      : (current?.sarvamTtsModel ?? null),
    sarvamSttModel: input.sarvamSttModel !== undefined
      ? normalizeStringOrNull(input.sarvamSttModel)
      : (current?.sarvamSttModel ?? null),
    defaultSarvamSpeaker: input.defaultSarvamSpeaker !== undefined
      ? normalizeStringOrNull(input.defaultSarvamSpeaker)
      : (current?.defaultSarvamSpeaker ?? null),
    translationMode: input.translationMode !== undefined
      ? input.translationMode
      : (current?.translationMode ?? "off"),
    allowedChatModels:
      input.allowedChatModels ?? current?.allowedChatModels ?? {},
    allowedEmbeddingModels:
      input.allowedEmbeddingModels ?? current?.allowedEmbeddingModels ?? {},
    allowedRealtimeModels:
      input.allowedRealtimeModels ?? current?.allowedRealtimeModels ?? {},
    allowedVoices: input.allowedVoices ?? current?.allowedVoices ?? {},
    defaultChatModel:
      input.defaultChatModel !== undefined
        ? normalizeStringOrNull(input.defaultChatModel)
        : (current?.defaultChatModel ?? null),
    defaultEmbeddingModel:
      input.defaultEmbeddingModel !== undefined
        ? normalizeStringOrNull(input.defaultEmbeddingModel)
        : (current?.defaultEmbeddingModel ?? null),
    defaultRealtimeModel:
      input.defaultRealtimeModel !== undefined
        ? normalizeStringOrNull(input.defaultRealtimeModel)
        : (current?.defaultRealtimeModel ?? null),
    defaultTranscriptionModel:
      input.defaultTranscriptionModel !== undefined
        ? normalizeStringOrNull(input.defaultTranscriptionModel)
        : (current?.defaultTranscriptionModel ?? null),
    maxChatTokens:
      input.maxChatTokens !== undefined
        ? input.maxChatTokens
        : (current?.maxChatTokens ?? null),
    maxRealtimeTokens:
      input.maxRealtimeTokens !== undefined
        ? input.maxRealtimeTokens
        : (current?.maxRealtimeTokens ?? null),
    maxTemperature:
      input.maxTemperature !== undefined
        ? input.maxTemperature
        : (current?.maxTemperature ?? null),
    enablePublicEmbed:
      input.enablePublicEmbed !== undefined
        ? input.enablePublicEmbed
        : (current?.enablePublicEmbed ?? true),
    enableVoice:
      input.enableVoice !== undefined
        ? input.enableVoice
        : (current?.enableVoice ?? true),
    enableRealtime:
      input.enableRealtime !== undefined
        ? input.enableRealtime
        : (current?.enableRealtime ?? true),
    // Identity
    assistantName:
      input.assistantName !== undefined
        ? normalizeStringOrNull(input.assistantName)
        : (current?.assistantName ?? null),
    avatarUrl:
      input.avatarUrl !== undefined
        ? normalizeStringOrNull(input.avatarUrl)
        : (current?.avatarUrl ?? null),
    // Behaviour
    systemPrompt:
      input.systemPrompt !== undefined
        ? normalizeStringOrNull(input.systemPrompt)
        : (current?.systemPrompt ?? null),
    welcomeMessage:
      input.welcomeMessage !== undefined
        ? normalizeStringOrNull(input.welcomeMessage)
        : (current?.welcomeMessage ?? null),
    outOfScopeReply:
      input.outOfScopeReply !== undefined
        ? normalizeStringOrNull(input.outOfScopeReply)
        : (current?.outOfScopeReply ?? null),
    rules: input.rules !== undefined ? input.rules : (current?.rules ?? null),
    // Language
    defaultLanguage:
      input.defaultLanguage !== undefined
        ? normalizeStringOrNull(input.defaultLanguage)
        : (current?.defaultLanguage ?? null),
    // NOT NULL in the schema (DEFAULT only applies when the column is omitted
    // from the INSERT — we always list it), so coalesce to the schema default
    // for fresh rows instead of failing the insert.
    allowedLanguages:
      input.allowedLanguages !== undefined
        ? input.allowedLanguages
        : (current?.allowedLanguages ?? ["en"]),
    alwaysRespondIn:
      input.alwaysRespondIn !== undefined
        ? normalizeStringOrNull(input.alwaysRespondIn)
        : (current?.alwaysRespondIn ?? null),
    // Voice
    voiceId:
      input.voiceId !== undefined
        ? normalizeStringOrNull(input.voiceId)
        : (current?.voiceId ?? null),
    voiceSpeed:
      input.voiceSpeed !== undefined
        ? input.voiceSpeed
        : (current?.voiceSpeed ?? null),
  };

  const row = await queryOne<Row>(
    `INSERT INTO org_ai_settings (
       org_id,
       default_provider,
       allowed_providers,
       voice_provider,
       allowed_voice_providers,
       realtime_voice_provider,
       elevenlabs_tts_model,
       elevenlabs_stt_model,
       default_elevenlabs_voice,
       sarvam_tts_model,
       sarvam_stt_model,
       default_sarvam_speaker,
       translation_mode,
       allowed_chat_models,
       allowed_embedding_models,
       allowed_realtime_models,
       allowed_voices,
       default_chat_model,
       default_embedding_model,
       default_realtime_model,
       default_transcription_model,
       max_chat_tokens,
       max_realtime_tokens,
       max_temperature,
       enable_public_embed,
       enable_voice,
       enable_realtime,
       assistant_name,
       avatar_url,
       system_prompt,
       welcome_message,
       out_of_scope_reply,
       rules,
       default_language,
       allowed_languages,
       always_respond_in,
       voice_id,
       speed
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
       $24, $25, $26, $27, $28, $29::jsonb, $30, $31, $32, $33, $34,
       $35, $36, $37, $38
     )
     ON CONFLICT (org_id)
     DO UPDATE SET
       default_provider = EXCLUDED.default_provider,
       allowed_providers = EXCLUDED.allowed_providers,
       voice_provider = EXCLUDED.voice_provider,
       allowed_voice_providers = EXCLUDED.allowed_voice_providers,
       realtime_voice_provider = EXCLUDED.realtime_voice_provider,
       elevenlabs_tts_model = EXCLUDED.elevenlabs_tts_model,
       elevenlabs_stt_model = EXCLUDED.elevenlabs_stt_model,
       default_elevenlabs_voice = EXCLUDED.default_elevenlabs_voice,
       sarvam_tts_model = EXCLUDED.sarvam_tts_model,
       sarvam_stt_model = EXCLUDED.sarvam_stt_model,
       default_sarvam_speaker = EXCLUDED.default_sarvam_speaker,
       translation_mode = EXCLUDED.translation_mode,
       allowed_chat_models = EXCLUDED.allowed_chat_models,
       allowed_embedding_models = EXCLUDED.allowed_embedding_models,
       allowed_realtime_models = EXCLUDED.allowed_realtime_models,
       allowed_voices = EXCLUDED.allowed_voices,
       default_chat_model = EXCLUDED.default_chat_model,
       default_embedding_model = EXCLUDED.default_embedding_model,
       default_realtime_model = EXCLUDED.default_realtime_model,
       default_transcription_model = EXCLUDED.default_transcription_model,
       max_chat_tokens = EXCLUDED.max_chat_tokens,
       max_realtime_tokens = EXCLUDED.max_realtime_tokens,
       max_temperature = EXCLUDED.max_temperature,
       enable_public_embed = EXCLUDED.enable_public_embed,
       enable_voice = EXCLUDED.enable_voice,
       enable_realtime = EXCLUDED.enable_realtime,
       assistant_name = EXCLUDED.assistant_name,
       avatar_url = EXCLUDED.avatar_url,
       system_prompt = EXCLUDED.system_prompt,
       welcome_message = EXCLUDED.welcome_message,
       out_of_scope_reply = EXCLUDED.out_of_scope_reply,
       rules = EXCLUDED.rules,
       default_language = EXCLUDED.default_language,
       allowed_languages = EXCLUDED.allowed_languages,
       always_respond_in = EXCLUDED.always_respond_in,
       voice_id = EXCLUDED.voice_id,
       speed = EXCLUDED.speed,
       updated_at = now()
     RETURNING *`,
    [
      orgId,
      next.defaultProvider,
      next.allowedProviders,
      next.voiceProvider,
      next.allowedVoiceProviders,
      next.realtimeVoiceProvider,
      next.elevenlabsTtsModel,
      next.elevenlabsSttModel,
      next.defaultElevenlabsVoice,
      next.sarvamTtsModel,
      next.sarvamSttModel,
      next.defaultSarvamSpeaker,
      next.translationMode,
      JSON.stringify(next.allowedChatModels),
      JSON.stringify(next.allowedEmbeddingModels),
      JSON.stringify(next.allowedRealtimeModels),
      JSON.stringify(next.allowedVoices),
      next.defaultChatModel,
      next.defaultEmbeddingModel,
      next.defaultRealtimeModel,
      next.defaultTranscriptionModel,
      next.maxChatTokens,
      next.maxRealtimeTokens,
      next.maxTemperature,
      next.enablePublicEmbed,
      next.enableVoice,
      next.enableRealtime,
      next.assistantName,
      next.avatarUrl,
      next.systemPrompt,
      next.welcomeMessage,
      next.outOfScopeReply,
      JSON.stringify(next.rules ?? []),
      next.defaultLanguage,
      next.allowedLanguages,
      next.alwaysRespondIn,
      next.voiceId,
      next.voiceSpeed,
    ],
  );

  if (!row) {
    throw new Error(`Failed to upsert org AI settings for org ${orgId}`);
  }
  return toOrgAISettings(row);
}
