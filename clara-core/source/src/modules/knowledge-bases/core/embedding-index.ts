/**
 * src/modules/knowledge-bases/core/embedding-index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Which embedding model built each knowledge-base index — and therefore which
 * model every query and every new chunk for that index must use.
 *
 * Before this, retrieval embedded the question with whatever model was
 * configured NOW, so changing the embedding model silently broke search on
 * every existing collection. Now each Qdrant collection is registered with
 * the model that built it (kb_vector_collections):
 *
 *   • search      → embeds with the collection's registered model
 *   • ingestion   → writes with the collection's registered model
 *   • switching   → a re-index job (reindex.ts) builds a NEW collection with
 *                   the new model and swaps only when it is complete — the
 *                   ElevenLabs "RAG index per model" approach on Clara's own
 *                   Qdrant.
 *
 * Collections that predate the registry are adopted on first use with the
 * model the platform resolves for them today (the previous behaviour).
 */

import { query, queryOne } from "@/lib/db";
import { loadRuntimeSettingsOnStartup } from "@/lib/db/migrate";
import { getQdrantClient } from "@/modules/admin/core/vector-store";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { getProviderApiKey, resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
import { getMultilingualSettings } from "@/modules/ai-core/multilingual-embeddings";
import type { AIProvider, EmbeddingProviderId, ProviderConfig } from "@/modules/ai-core/types";

export type EmbeddingIndexKind = "standard" | "multilingual";
export type CollectionRole = "live" | "building" | "retired" | "snapshot";

export type CollectionEmbedding = {
  collectionName: string;
  kbId: string | null;
  index: EmbeddingIndexKind;
  provider: EmbeddingProviderId;
  model: string;
  dimension: number;
  role: CollectionRole;
};

export type ReindexJob = {
  id: string;
  kbId: string;
  sourceCollection: string;
  targetCollection: string;
  targetIndex: EmbeddingIndexKind;
  provider: EmbeddingProviderId;
  model: string;
  dimension: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  cursor: string | number | null;
  pointsTotal: number;
  pointsDone: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type Row = Record<string, unknown>;

export function isEmbeddingIndexKind(value: unknown): value is EmbeddingIndexKind {
  return value === "standard" || value === "multilingual";
}

// ── Runtime settings ────────────────────────────────────────────────────────

/**
 * The MULTILINGUAL_EMBEDDINGS_* settings live in platform_env_settings. A cold
 * serverless instance may not have loaded them yet (they are loaded as a
 * side effect of other AI resolution), so refresh them at most once a minute.
 */
let settingsLoadedAt = 0;
export async function ensureRuntimeSettings(): Promise<void> {
  if (Date.now() - settingsLoadedAt < 60_000) return;
  settingsLoadedAt = Date.now();
  await loadRuntimeSettingsOnStartup().catch(() => {});
}

// ── Registry ────────────────────────────────────────────────────────────────

/** A collection's model never changes; only its role does. */
const REGISTRY_TTL_MS = 5 * 60 * 1000;
const registryCache = new Map<string, { value: CollectionEmbedding | null; expiresAt: number }>();

function toEntry(row: Row): CollectionEmbedding {
  return {
    collectionName: String(row.collection_name),
    kbId: row.kb_id == null ? null : String(row.kb_id),
    index: isEmbeddingIndexKind(row.embedding_index) ? row.embedding_index : "standard",
    provider: String(row.embedding_provider) as EmbeddingProviderId,
    model: String(row.embedding_model),
    dimension: Number(row.dimension),
    role: String(row.role) as CollectionRole,
  };
}

export async function getCollectionEmbedding(collectionName: string): Promise<CollectionEmbedding | null> {
  const cached = registryCache.get(collectionName);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const row = await queryOne<Row>(
    "SELECT * FROM kb_vector_collections WHERE collection_name = $1",
    [collectionName],
  );
  const value = row ? toEntry(row) : null;
  // A missing row is re-checked soon (it is usually registered right after).
  registryCache.set(collectionName, { value, expiresAt: Date.now() + (value ? REGISTRY_TTL_MS : 5_000) });
  return value;
}

export async function registerCollectionEmbedding(
  entry: Omit<CollectionEmbedding, "role"> & { role?: CollectionRole },
): Promise<CollectionEmbedding> {
  const row = await queryOne<Row>(
    `INSERT INTO kb_vector_collections
       (collection_name, kb_id, embedding_index, embedding_provider, embedding_model, dimension, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (collection_name) DO UPDATE SET updated_at = kb_vector_collections.updated_at
     RETURNING *`,
    [entry.collectionName, entry.kbId, entry.index, entry.provider, entry.model, entry.dimension, entry.role ?? "live"],
  );
  const value = row ? toEntry(row) : { ...entry, role: entry.role ?? "live" };
  registryCache.set(entry.collectionName, { value, expiresAt: Date.now() + REGISTRY_TTL_MS });
  return value;
}

export async function setCollectionRole(collectionName: string, role: CollectionRole): Promise<void> {
  await query("UPDATE kb_vector_collections SET role = $2, updated_at = now() WHERE collection_name = $1", [
    collectionName,
    role,
  ]);
  registryCache.delete(collectionName);
}

export async function forgetCollection(collectionName: string): Promise<void> {
  await query("DELETE FROM kb_vector_collections WHERE collection_name = $1", [collectionName]);
  registryCache.delete(collectionName);
}

/** A published snapshot is a byte copy — it keeps its source's model. */
export async function copyCollectionEmbedding(source: string, target: string): Promise<void> {
  const entry = await getCollectionEmbedding(source);
  if (!entry) return; // unregistered source: adopted on first use like any legacy collection
  await registerCollectionEmbedding({ ...entry, collectionName: target, role: "snapshot" });
}

/** Test hook. */
export function clearEmbeddingIndexCaches(): void {
  registryCache.clear();
  settingsLoadedAt = 0;
}

// ── Provider configs ────────────────────────────────────────────────────────

/** The embedding config that reproduces a registered collection's vectors. */
export function providerConfigFor(entry: Pick<CollectionEmbedding, "provider" | "model" | "dimension">): ProviderConfig {
  if (entry.provider === "tei") {
    return { provider: "tei", embeddingModel: entry.model, embeddingDimension: entry.dimension };
  }
  return {
    provider: entry.provider,
    apiKey: getProviderApiKey(entry.provider as AIProvider),
    embeddingModel: entry.model,
    embeddingDimension: entry.dimension,
  };
}

export type IndexTarget = {
  index: EmbeddingIndexKind;
  config: ProviderConfig;
  provider: EmbeddingProviderId;
  model: string;
  dimension: number;
};

/** The model a NEW index of this kind is built with, for this KB. */
export async function targetForIndex(kbId: string, index: EmbeddingIndexKind): Promise<IndexTarget> {
  if (index === "multilingual") {
    const settings = getMultilingualSettings();
    const config: ProviderConfig = {
      provider: "tei",
      embeddingModel: settings.model,
      embeddingDimension: settings.dimension,
    };
    return { index, config, provider: "tei", model: settings.model, dimension: settings.dimension };
  }
  const resolved = await resolveAIConfig({ kbId, surface: "rag-embedding" });
  const config = toProviderConfig(resolved, "embedding");
  const provider = ProviderFactory.getProvider(config);
  return {
    index,
    config,
    provider: config.provider,
    model: provider.getModelName("embedding"),
    dimension: provider.getEmbeddingDimension(),
  };
}

// ── Availability (platform switch + subscription plan) ──────────────────────

export type MultilingualAvailability = {
  /** Platform admin enabled it and the endpoint is configured. */
  platform: boolean;
  /** The organisation's plan includes it. */
  plan: boolean;
  available: boolean;
  reason: string | null;
};

async function planAllowsMultilingual(orgId: string): Promise<boolean> {
  const sub = await queryOne<{ allowed: boolean; status: string; current_period_end: string | null }>(
    `SELECT COALESCE(pv.multilingual_embeddings, sp.multilingual_embeddings) AS allowed,
            os.status, os.current_period_end
       FROM org_subscriptions os
       JOIN subscription_plans sp ON sp.id = os.plan_id
       LEFT JOIN subscription_plan_versions pv ON pv.id = os.plan_version_id
      WHERE os.org_id = $1
      ORDER BY os.updated_at DESC
      LIMIT 1`,
    [orgId],
  );
  const end = sub?.current_period_end ? new Date(sub.current_period_end).getTime() : null;
  const goodStanding = sub && (sub.status === "active" || sub.status === "trialing") && !(end !== null && end < Date.now());
  if (sub && goodStanding) return Boolean(sub.allowed);
  const free = await queryOne<{ allowed: boolean }>(
    "SELECT multilingual_embeddings AS allowed FROM subscription_plans WHERE id = 'free'",
  );
  return Boolean(free?.allowed);
}

export async function getMultilingualAvailability(orgId: string | null): Promise<MultilingualAvailability> {
  await ensureRuntimeSettings();
  const settings = getMultilingualSettings();
  const platform = settings.available;
  const plan = orgId ? await planAllowsMultilingual(orgId).catch(() => false) : false;
  const reason = !settings.enabled
    ? "The multilingual knowledge index is not enabled on this platform."
    : !settings.configured
      ? "The multilingual embeddings endpoint is not configured yet."
      : !plan
        ? "Your subscription plan does not include the multilingual knowledge index."
        : null;
  return { platform, plan, available: platform && plan, reason };
}

// ── KB context ──────────────────────────────────────────────────────────────

export type KbIndexContext = {
  kbId: string;
  orgId: string | null;
  collection: string;
  desiredIndex: EmbeddingIndexKind;
};

export async function getKbIndexContext(kbId: string): Promise<KbIndexContext | null> {
  const row = await queryOne<{ qdrant_collection: string; embedding_index: string | null; org_id: string | null }>(
    `SELECT kb.qdrant_collection, kb.embedding_index, a.org_id
       FROM knowledge_bases kb JOIN agents a ON a.id = kb.agent_id
      WHERE kb.id = $1`,
    [kbId],
  );
  if (!row) return null;
  return {
    kbId,
    orgId: row.org_id,
    collection: row.qdrant_collection,
    desiredIndex: isEmbeddingIndexKind(row.embedding_index) ? row.embedding_index : "standard",
  };
}

async function collectionHasPoints(collectionName: string): Promise<boolean> {
  try {
    const result = await getQdrantClient().count(collectionName, { exact: false });
    return (result?.count ?? 0) > 0;
  } catch {
    return false; // missing collection
  }
}

/**
 * The embedding config for WRITING into a KB collection (ingestion, chunk
 * edits). A registered collection keeps its model. An unregistered one is
 * adopted: an existing, populated collection keeps today's standard model; a
 * new/empty one is built with the KB's chosen index (multilingual only when
 * the platform and the plan allow it).
 */
export async function resolveWriteEmbedding(
  kbId: string,
  collectionName: string,
): Promise<{ config: ProviderConfig; entry: CollectionEmbedding }> {
  await ensureRuntimeSettings();
  const registered = await getCollectionEmbedding(collectionName);
  if (registered) return { config: providerConfigFor(registered), entry: registered };

  let index: EmbeddingIndexKind = "standard";
  if (!(await collectionHasPoints(collectionName))) {
    const context = await getKbIndexContext(kbId);
    if (context?.desiredIndex === "multilingual") {
      const availability = await getMultilingualAvailability(context.orgId);
      if (availability.available) index = "multilingual";
    }
  }
  const target = await targetForIndex(kbId, index);
  const entry = await registerCollectionEmbedding({
    collectionName,
    kbId,
    index,
    provider: target.provider,
    model: target.model,
    dimension: target.dimension,
    role: "live",
  });
  return { config: providerConfigFor(entry), entry };
}

/**
 * The embedding config for SEARCHING a collection: the model that built it.
 * An unregistered (legacy) collection is adopted with `fallback` — the model
 * the caller resolved today, which is what it always used.
 */
export async function resolveSearchEmbedding(
  collectionName: string,
  fallback: ProviderConfig,
  kbId: string | null,
): Promise<ProviderConfig> {
  const registered = await getCollectionEmbedding(collectionName).catch(() => null);
  if (registered?.provider === "tei") await ensureRuntimeSettings();
  if (registered) return providerConfigFor(registered);
  try {
    const provider = ProviderFactory.getProvider(fallback);
    await registerCollectionEmbedding({
      collectionName,
      kbId,
      index: fallback.provider === "tei" ? "multilingual" : "standard",
      provider: fallback.provider,
      model: provider.getModelName("embedding"),
      dimension: provider.getEmbeddingDimension(),
      role: collectionName.startsWith("pub_") ? "snapshot" : "live",
    });
  } catch (error) {
    console.warn("[embedding-index] could not adopt collection:", (error as Error).message);
  }
  return fallback;
}

// ── Jobs (read side; the engine lives in reindex.ts) ────────────────────────

export function toJob(row: Row): ReindexJob {
  const cursor = row.cursor as { offset?: string | number } | null;
  return {
    id: String(row.id),
    kbId: String(row.kb_id),
    sourceCollection: String(row.source_collection),
    targetCollection: String(row.target_collection),
    targetIndex: isEmbeddingIndexKind(row.target_index) ? row.target_index : "standard",
    provider: String(row.embedding_provider) as EmbeddingProviderId,
    model: String(row.embedding_model),
    dimension: Number(row.dimension),
    status: String(row.status) as ReindexJob["status"],
    cursor: cursor?.offset ?? null,
    pointsTotal: Number(row.points_total ?? 0),
    pointsDone: Number(row.points_done ?? 0),
    errorMessage: row.error_message == null ? null : String(row.error_message),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at == null ? null : String(row.completed_at),
  };
}

/** The KB's queued/running re-index job — ingestion dual-writes into it. */
export async function getActiveReindexJob(kbId: string): Promise<ReindexJob | null> {
  const row = await queryOne<Row>(
    "SELECT * FROM kb_reindex_jobs WHERE kb_id = $1 AND status IN ('queued','running') LIMIT 1",
    [kbId],
  );
  return row ? toJob(row) : null;
}
