import { queryOne } from "@/lib/db";
import type {
  KBAIOverrides,
  PatchKBAIOverridesInput,
} from "@/modules/ai-core/config-types";
import { isVoiceProvider } from "@/modules/voice-core/types";

type Row = Record<string, unknown>;

function normalizeStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toKBAIOverrides(row: Row): KBAIOverrides {
  return {
    id: String(row.id),
    kbId: String(row.kb_id),
    provider:
      row.provider === "openai" || row.provider === "gemini" ? row.provider : null,
    voiceProvider: isVoiceProvider(row.voice_provider) ? row.voice_provider : null,
    realtimeVoiceProvider: isVoiceProvider(row.realtime_voice_provider) ? row.realtime_voice_provider : null,
    chatModel: normalizeStringOrNull(row.chat_model),
    embeddingModel: normalizeStringOrNull(row.embedding_model),
    realtimeModel: normalizeStringOrNull(row.realtime_model),
    transcriptionModel: normalizeStringOrNull(row.transcription_model),
    disableVoice: Boolean(row.disable_voice),
    disablePublicEmbed: Boolean(row.disable_public_embed),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getKbAIOverrides(kbId: string): Promise<KBAIOverrides | null> {
  const row = await queryOne<Row>("SELECT * FROM kb_ai_overrides WHERE kb_id = $1", [kbId]);
  return row ? toKBAIOverrides(row) : null;
}

export async function upsertKbAIOverrides(
  kbId: string,
  input: PatchKBAIOverridesInput,
): Promise<KBAIOverrides> {
  const current = await getKbAIOverrides(kbId);
  const next = {
    provider:
      input.provider !== undefined ? input.provider : current?.provider ?? null,
    voiceProvider:
      input.voiceProvider !== undefined ? input.voiceProvider : current?.voiceProvider ?? null,
    realtimeVoiceProvider:
      input.realtimeVoiceProvider !== undefined ? input.realtimeVoiceProvider : current?.realtimeVoiceProvider ?? null,
    chatModel:
      input.chatModel !== undefined ? normalizeStringOrNull(input.chatModel) : current?.chatModel ?? null,
    embeddingModel:
      input.embeddingModel !== undefined
        ? normalizeStringOrNull(input.embeddingModel)
        : current?.embeddingModel ?? null,
    realtimeModel:
      input.realtimeModel !== undefined
        ? normalizeStringOrNull(input.realtimeModel)
        : current?.realtimeModel ?? null,
    transcriptionModel:
      input.transcriptionModel !== undefined
        ? normalizeStringOrNull(input.transcriptionModel)
        : current?.transcriptionModel ?? null,
    disableVoice:
      input.disableVoice !== undefined ? input.disableVoice : current?.disableVoice ?? false,
    disablePublicEmbed:
      input.disablePublicEmbed !== undefined
        ? input.disablePublicEmbed
        : current?.disablePublicEmbed ?? false,
  };

  const row = await queryOne<Row>(
    `INSERT INTO kb_ai_overrides (
       kb_id,
       provider,
       voice_provider,
       realtime_voice_provider,
       chat_model,
       embedding_model,
       realtime_model,
       transcription_model,
       disable_voice,
       disable_public_embed
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (kb_id)
     DO UPDATE SET
       provider = EXCLUDED.provider,
       voice_provider = EXCLUDED.voice_provider,
       realtime_voice_provider = EXCLUDED.realtime_voice_provider,
       chat_model = EXCLUDED.chat_model,
       embedding_model = EXCLUDED.embedding_model,
       realtime_model = EXCLUDED.realtime_model,
       transcription_model = EXCLUDED.transcription_model,
       disable_voice = EXCLUDED.disable_voice,
       disable_public_embed = EXCLUDED.disable_public_embed,
       updated_at = now()
     RETURNING *`,
    [
      kbId,
      next.provider,
      next.voiceProvider,
      next.realtimeVoiceProvider,
      next.chatModel,
      next.embeddingModel,
      next.realtimeModel,
      next.transcriptionModel,
      next.disableVoice,
      next.disablePublicEmbed,
    ],
  );

  if (!row) {
    throw new Error(`Failed to upsert KB AI overrides for KB ${kbId}`);
  }
  return toKBAIOverrides(row);
}
