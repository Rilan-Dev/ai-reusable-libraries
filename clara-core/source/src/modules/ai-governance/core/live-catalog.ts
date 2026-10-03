/**
 * Live provider catalogue synchronisation.
 *
 * The admin provider workspace and runtime resolver must use the vendor's
 * currently available catalogue, not the bootstrap rows from migration 040.
 * Bootstrap rows remain as a safe fallback when a provider is unreachable.
 *
 * Secrets never leave the server. New vendor resources are inserted into the
 * existing governance catalogue; previously discovered resources are disabled
 * when the vendor no longer advertises them.
 */

import { execute } from "@/lib/db";

type Provider = "openai" | "gemini" | "sarvam" | "elevenlabs";
type Capability = "chat" | "voice_chat" | "realtime_voice";
type Kind = "chat" | "embedding" | "realtime" | "transcription" | "tts" | "stt" | "voice";

type CatalogItem = {
  providerId: Provider;
  capability: Capability;
  kind: Kind;
  modelId: string;
  displayName: string;
  metadata?: Record<string, unknown>;
};

const SYNC_TTL_MS = 5 * 60_000;
let lastSyncAt = 0;
let syncPromise: Promise<void> | null = null;

function key(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

async function jsonFetch(url: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function upsertItems(items: CatalogItem[]): Promise<void> {
  if (!items.length) return Promise.resolve();
  return (async () => {
    for (const item of items) {
      await execute(
        `INSERT INTO platform_ai_provider_models
          (provider_id, capability, kind, model_id, display_name, enabled, metadata)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6::jsonb)
         ON CONFLICT (provider_id, capability, kind, model_id)
         DO UPDATE SET
           display_name = EXCLUDED.display_name,
           metadata = EXCLUDED.metadata,
           updated_at = now()`,
        [
          item.providerId,
          item.capability,
          item.kind,
          item.modelId,
          item.displayName,
          JSON.stringify({ ...(item.metadata ?? {}), catalogSource: "vendor_live", syncedAt: new Date().toISOString() }),
        ],
      );
    }
  })();
}

async function disableMissing(provider: Provider, capability: Capability, kind: Kind, liveIds: Set<string>): Promise<void> {
  if (!liveIds.size) return;
  await execute(
    `UPDATE platform_ai_provider_models
        SET enabled = FALSE, updated_at = now(),
            metadata = metadata || jsonb_build_object('catalogSource', 'vendor_live', 'stale', TRUE, 'staleAt', now())
      WHERE provider_id = $1 AND capability = $2 AND kind = $3
        AND model_id <> ALL($4::text[])
        AND COALESCE(metadata->>'catalogSource', '') = 'vendor_live'`,
    [provider, capability, kind, [...liveIds]],
  );
}

function classifyOpenAIModel(id: string): Array<{ capability: Capability; kind: Kind }> {
  const value = id.toLowerCase();
  if (value.includes("embedding")) return [{ capability: "chat", kind: "embedding" }];
  if (value.includes("transcribe") || value === "whisper-1") return [{ capability: "realtime_voice", kind: "transcription" }];
  if (value.includes("realtime")) return [{ capability: "realtime_voice", kind: "realtime" }];
  if (/^(gpt-|o[1-9]|chatgpt-)/.test(value)) return [{ capability: "chat", kind: "chat" }];
  return [];
}

async function syncOpenAI(): Promise<void> {
  const apiKey = key("OPENAI_API_KEY");
  if (!apiKey) return;
  const body = (await jsonFetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  })) as { data?: Array<{ id: string; owned_by?: string }> };
  const items: CatalogItem[] = [];
  for (const model of body.data ?? []) {
    for (const slot of classifyOpenAIModel(model.id)) {
      items.push({
        providerId: "openai",
        ...slot,
        modelId: model.id,
        displayName: model.id,
        metadata: { ownedBy: model.owned_by ?? null },
      });
    }
  }
  const groups = new Map<string, Set<string>>();
  for (const item of items) {
    const group = `${item.capability}:${item.kind}`;
    if (!groups.has(group)) groups.set(group, new Set());
    groups.get(group)!.add(item.modelId);
  }
  await upsertItems(items);
  for (const [group, ids] of groups) {
    const [capability, kind] = group.split(":") as [Capability, Kind];
    await disableMissing("openai", capability, kind, ids);
  }
}

async function syncGemini(): Promise<void> {
  const apiKey = key("GEMINI_API_KEY");
  if (!apiKey) return;
  const items: CatalogItem[] = [];
  let pageToken = "";
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) qs.set("pageToken", pageToken);
    const body = (await jsonFetch(`https://generativelanguage.googleapis.com/v1beta/models?${qs}`, {
      headers: { "x-goog-api-key": apiKey },
    })) as {
      models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>;
      nextPageToken?: string;
    };
    for (const model of body.models ?? []) {
      const id = (model.name ?? "").replace(/^models\//, "");
      if (!id) continue;
      const methods = model.supportedGenerationMethods ?? [];
      if (methods.includes("embedContent")) {
        items.push({ providerId: "gemini", capability: "chat", kind: "embedding", modelId: id, displayName: model.displayName ?? id });
      }
      if (methods.includes("generateContent")) {
        items.push({ providerId: "gemini", capability: "chat", kind: "chat", modelId: id, displayName: model.displayName ?? id });
      }
      if (methods.some((method) => /bidi/i.test(method))) {
        items.push({ providerId: "gemini", capability: "realtime_voice", kind: "realtime", modelId: id, displayName: model.displayName ?? id });
      }
    }
    pageToken = body.nextPageToken ?? "";
    if (!pageToken) break;
  }
  const groups = new Map<string, Set<string>>();
  for (const item of items) {
    const group = `${item.capability}:${item.kind}`;
    if (!groups.has(group)) groups.set(group, new Set());
    groups.get(group)!.add(item.modelId);
  }
  await upsertItems(items);
  for (const [group, ids] of groups) {
    const [capability, kind] = group.split(":") as [Capability, Kind];
    await disableMissing("gemini", capability, kind, ids);
  }
}

async function syncSarvam(): Promise<void> {
  const apiKey = key("SARVAM_API_KEY");
  if (!apiKey) return;
  const body = (await jsonFetch("https://api.sarvam.ai/v2/models", {
    headers: { "api-subscription-key": apiKey, Authorization: `Bearer ${apiKey}` },
  })) as { data?: Array<{ id?: string; owned_by?: string }> };
  const items: CatalogItem[] = [];
  for (const model of body.data ?? []) {
    if (!model.id) continue;
    items.push({
      providerId: "sarvam",
      capability: "chat",
      kind: "chat",
      modelId: model.id,
      displayName: model.id,
      metadata: { ownedBy: model.owned_by ?? null },
    });
  }
  await upsertItems(items);
  await disableMissing("sarvam", "chat", "chat", new Set(items.map((item) => item.modelId)));
}

async function syncElevenLabs(): Promise<void> {
  const apiKey = key("ELEVENLABS_API_KEY");
  if (!apiKey) return;
  const base = (key("ELEVENLABS_API_BASE_URL") || key("ELEVENLABS_BASE_URL") || "https://api.elevenlabs.io").replace(/\/+$/, "");
  const headers = { "xi-api-key": apiKey };

  const models = (await jsonFetch(`${base}/v1/models`, { headers })) as Array<{
    model_id?: string;
    name?: string;
    can_do_text_to_speech?: boolean;
    can_do_voice_conversion?: boolean;
  }>;
  const modelItems: CatalogItem[] = [];
  for (const model of models ?? []) {
    if (!model.model_id) continue;
    if (model.can_do_text_to_speech) {
      modelItems.push({
        providerId: "elevenlabs",
        capability: "voice_chat",
        kind: "tts",
        modelId: model.model_id,
        displayName: model.name ?? model.model_id,
      });
    }
  }

  const voiceItems: CatalogItem[] = [];
  let nextPageToken = "";
  for (let page = 0; page < 100; page++) {
    const qs = new URLSearchParams({ page_size: "100", include_total_count: "false" });
    if (nextPageToken) qs.set("next_page_token", nextPageToken);
    const body = (await jsonFetch(`${base}/v2/voices?${qs}`, { headers })) as {
      voices?: Array<{ voice_id?: string; name?: string; category?: string; verified_languages?: unknown[] }>;
      has_more?: boolean;
      next_page_token?: string;
    };
    for (const voice of body.voices ?? []) {
      if (!voice.voice_id) continue;
      voiceItems.push({
        providerId: "elevenlabs",
        capability: "voice_chat",
        kind: "voice",
        modelId: voice.voice_id,
        displayName: voice.name ?? voice.voice_id,
        metadata: { category: voice.category ?? null, verifiedLanguages: voice.verified_languages ?? [] },
      });
    }
    nextPageToken = body.next_page_token ?? "";
    if (!body.has_more || !nextPageToken) break;
  }

  // The same ElevenLabs workspace voices are valid for both turn-based
  // Voice Chat and Clara-controlled Realtime Voice. Previously we only
  // catalogued them under voice_chat, so the Realtime Voice half-canvas saw
  // zero voices even though /v2/voices returned them successfully.
  const realtimeVoiceItems = voiceItems.map((item) => ({
    ...item,
    capability: "realtime_voice" as const,
  }));

  await upsertItems([...modelItems, ...voiceItems, ...realtimeVoiceItems]);
  await disableMissing("elevenlabs", "voice_chat", "tts", new Set(modelItems.map((item) => item.modelId)));
  await disableMissing("elevenlabs", "voice_chat", "voice", new Set(voiceItems.map((item) => item.modelId)));
  await disableMissing("elevenlabs", "realtime_voice", "voice", new Set(realtimeVoiceItems.map((item) => item.modelId)));
}

async function runSync(): Promise<void> {
  // A single failed provider must not prevent the others from refreshing.
  await Promise.allSettled([syncOpenAI(), syncGemini(), syncSarvam(), syncElevenLabs()]);
}

export async function syncLiveProviderCatalog(): Promise<void> {
  const now = Date.now();
  if (now - lastSyncAt < SYNC_TTL_MS) return;
  if (syncPromise) return syncPromise;
  syncPromise = runSync()
    .catch((error) => {
      console.warn("[ai-governance] live provider catalogue sync failed:", error);
    })
    .finally(() => {
      lastSyncAt = Date.now();
      syncPromise = null;
    });
  return syncPromise;
}
