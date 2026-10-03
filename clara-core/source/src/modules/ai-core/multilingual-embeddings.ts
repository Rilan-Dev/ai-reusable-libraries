/**
 * src/modules/ai-core/multilingual-embeddings.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Multilingual knowledge index — the embedding models ElevenLabs Agents offer
 * for RAG, served from an endpoint the platform admin configures.
 *
 * ElevenLabs computes a RAG index per document per embedding model and offers
 *   • e5_mistral_7b_instruct          (4096-d, English-focused)
 *   • multilingual_e5_large_instruct  (1024-d, ~100 languages)
 * Clara uses the same open models (intfloat/*) through any Text Embeddings
 * Inference (TEI) or OpenAI-compatible /v1/embeddings server:
 *   • VPS (self-hosted): the `embeddings` service in docker-compose.yml
 *   • Vercel (cloud):    a hosted endpoint serving the same model
 *
 * Nothing tenant-specific here: the endpoint, key and model are platform
 * runtime settings (Settings → AI), and plans decide who may use it.
 */

export type MultilingualModelFamily = "e5-instruct" | "e5" | "plain";

export type MultilingualEmbeddingModel = {
  id: string;
  label: string;
  dimension: number;
  family: MultilingualModelFamily;
  /** Languages the model was trained for (approximate, for the UI). */
  languages: number;
  /** The equivalent ElevenLabs RAG model id, when there is one. */
  elevenLabsModel?: string;
  /** Maximum input tokens; longer chunks are truncated by the server. */
  maxTokens: number;
};

export const MULTILINGUAL_EMBEDDING_MODELS: MultilingualEmbeddingModel[] = [
  {
    id: "intfloat/multilingual-e5-large-instruct",
    label: "Multilingual E5 Large Instruct",
    dimension: 1024,
    family: "e5-instruct",
    languages: 100,
    elevenLabsModel: "multilingual_e5_large_instruct",
    maxTokens: 512,
  },
  {
    id: "intfloat/e5-mistral-7b-instruct",
    label: "E5 Mistral 7B Instruct (English, GPU)",
    dimension: 4096,
    family: "e5-instruct",
    languages: 1,
    elevenLabsModel: "e5_mistral_7b_instruct",
    maxTokens: 4096,
  },
  {
    id: "intfloat/multilingual-e5-large",
    label: "Multilingual E5 Large",
    dimension: 1024,
    family: "e5",
    languages: 100,
    maxTokens: 512,
  },
  {
    id: "BAAI/bge-m3",
    label: "BGE-M3",
    dimension: 1024,
    family: "plain",
    languages: 100,
    maxTokens: 8192,
  },
];

export const DEFAULT_MULTILINGUAL_MODEL = "intfloat/multilingual-e5-large-instruct";

/**
 * Retrieval task description for instruct models (E5 model card format:
 * "Instruct: {task}\nQuery: {query}"; passages are embedded as-is).
 */
const DEFAULT_QUERY_TASK = "Given a question, retrieve passages from the knowledge base that answer the question";

export function findMultilingualModel(id: string | null | undefined): MultilingualEmbeddingModel | undefined {
  const needle = (id ?? "").trim().toLowerCase();
  return MULTILINGUAL_EMBEDDING_MODELS.find((m) => m.id.toLowerCase() === needle);
}

/** Model family by id — unknown ids fall back to naming conventions. */
export function modelFamily(id: string): MultilingualModelFamily {
  const known = findMultilingualModel(id);
  if (known) return known.family;
  const lower = id.toLowerCase();
  if (lower.includes("e5") && lower.includes("instruct")) return "e5-instruct";
  if (/(^|[/_-])e5([/_-]|$)/.test(lower) || lower.includes("-e5-")) return "e5";
  return "plain";
}

/**
 * Text as the model expects it. E5 models were trained with prefixes and
 * lose quality without them; "plain" models (BGE-M3) take raw text.
 */
export function formatEmbeddingInput(
  text: string,
  kind: "query" | "document",
  model: string,
  queryTask = process.env.MULTILINGUAL_EMBEDDINGS_QUERY_TASK?.trim() || DEFAULT_QUERY_TASK,
): string {
  const family = modelFamily(model);
  if (family === "e5-instruct") return kind === "query" ? `Instruct: ${queryTask}\nQuery: ${text}` : text;
  if (family === "e5") return `${kind === "query" ? "query" : "passage"}: ${text}`;
  return text;
}

/**
 * The embeddings URL for a configured base URL. Accepts a bare host
 * (TEI: http://embeddings:80), an OpenAI-style base (…/v1, …/v1/openai) or
 * the full …/embeddings URL.
 */
export function embeddingsEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (/\/embeddings$/i.test(base)) return base;
  if (/\/v\d+(\/openai)?$/i.test(base)) return `${base}/embeddings`;
  return `${base}/v1/embeddings`;
}

export type MultilingualSettings = {
  /** Platform admin switch. */
  enabled: boolean;
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
  dimension: number;
  /** Endpoint set and model dimension known. */
  configured: boolean;
  /** Enabled AND configured — offered to entitled organisations. */
  available: boolean;
};

export function getMultilingualSettings(env: Record<string, string | undefined> = process.env): MultilingualSettings {
  const enabled = (env.MULTILINGUAL_EMBEDDINGS_ENABLED ?? "").trim().toLowerCase() === "true";
  const baseUrl = (env.MULTILINGUAL_EMBEDDINGS_BASE_URL ?? "").trim();
  const apiKey = env.MULTILINGUAL_EMBEDDINGS_API_KEY?.trim() || undefined;
  const model = env.MULTILINGUAL_EMBEDDINGS_MODEL?.trim() || DEFAULT_MULTILINGUAL_MODEL;
  const explicit = Number(env.MULTILINGUAL_EMBEDDINGS_DIMENSION);
  const dimension = Number.isFinite(explicit) && explicit > 0
    ? Math.floor(explicit)
    : findMultilingualModel(model)?.dimension ?? 0;
  const configured = Boolean(baseUrl) && dimension > 0;
  return { enabled, baseUrl, apiKey, model, dimension, configured, available: enabled && configured };
}

/**
 * Minimum cosine similarity for a chunk to count as evidence, per model.
 * E5 models score everything between ~0.7 and 1.0 (low-temperature
 * contrastive training — see the E5 model card), so the 0.25 cut-off used
 * for OpenAI/Gemini embeddings would admit unrelated chunks. Override with
 * MULTILINGUAL_EMBEDDINGS_SCORE_THRESHOLD.
 */
export function scoreThresholdFor(
  provider: string | null | undefined,
  model: string | null | undefined,
  standardThreshold: number,
  env: Record<string, string | undefined> = process.env,
): number {
  if (provider !== "tei") return standardThreshold;
  const override = Number(env.MULTILINGUAL_EMBEDDINGS_SCORE_THRESHOLD);
  if (Number.isFinite(override) && override > 0 && override < 1) return override;
  const family = modelFamily(model ?? "");
  return family === "plain" ? 0.45 : 0.8;
}
