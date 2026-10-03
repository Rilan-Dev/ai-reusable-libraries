/**
 * OpenAI capability discovery.
 *
 * OpenAI exposes model discovery through GET /v1/models. It does not currently
 * expose a public API endpoint that enumerates the Realtime voice choices, so
 * voice IDs must be validated against the Realtime API contract rather than
 * inventing a /v1/voices request. Models are always fetched live.
 */

export type OpenAIModel = {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
};

export type OpenAICatalog = {
  models: OpenAIModel[];
  realtimeModels: OpenAIModel[];
  voices: Array<{
    id: string;
    label: string;
    description: string;
    realtime: boolean;
  }>;
  fetchedAt: string;
  voiceCatalogSource: "openai-realtime-api-contract";
};

/**
 * Realtime voice IDs are API contract values, not resources returned by
 * GET /v1/models. Keep this list isolated so it can be changed in one place
 * when OpenAI changes the Realtime voice contract.
 */
export const OPENAI_REALTIME_VOICES = [
  { id: "alloy", label: "Alloy", description: "Neutral and balanced", realtime: true },
  { id: "ash", label: "Ash", description: "Clear and conversational", realtime: true },
  { id: "ballad", label: "Ballad", description: "Warm and expressive", realtime: true },
  { id: "cedar", label: "Cedar", description: "Natural and steady", realtime: true },
  { id: "coral", label: "Coral", description: "Friendly and clear", realtime: true },
  { id: "echo", label: "Echo", description: "Calm and measured", realtime: true },
  { id: "marin", label: "Marin", description: "Natural and polished", realtime: true },
  { id: "sage", label: "Sage", description: "Clear and composed", realtime: true },
  { id: "shimmer", label: "Shimmer", description: "Soft and friendly", realtime: true },
  { id: "verse", label: "Verse", description: "Expressive and dynamic", realtime: true },
] as const;

export function isOpenAIRealtimeModel(id: string): boolean {
  const value = id.toLowerCase();
  return value.includes("realtime");
}

export function isSupportedOpenAIRealtimeVoice(id: string): boolean {
  return OPENAI_REALTIME_VOICES.some((voice) => voice.id === id);
}

export async function fetchOpenAIModelCatalog(apiKey: string): Promise<OpenAICatalog> {
  const response = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI model discovery failed (${response.status}): ${text.slice(0, 500)}`);
  }

  const payload = await response.json() as { data?: OpenAIModel[] };
  const models = Array.isArray(payload.data) ? payload.data : [];
  const realtimeModels = models
    .filter((model) => isOpenAIRealtimeModel(model.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    models,
    realtimeModels,
    voices: [...OPENAI_REALTIME_VOICES],
    fetchedAt: new Date().toISOString(),
    voiceCatalogSource: "openai-realtime-api-contract",
  };
}
