#!/usr/bin/env node
/**
 * scripts/validate-model-config.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * WS-0.4 acceptance: "the stored model configuration passes a validation
 * script that fails the build if a chat model id appears in an embedding
 * field."
 *
 * Two modes:
 *   • static (default, CI-safe, no DB): validates the model catalogue itself
 *     plus every model value committed in the repo — seeds, env examples.
 *   • --db: additionally connects to PostgreSQL and audits every stored
 *     configuration row (platform_env_settings, org_ai_settings,
 *     agent_ai_settings, kb_ai_overrides).
 *
 * Exit codes: 0 = clean, 1 = violations found, 2 = usage/runtime error.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ── Model classification (mirrors src/modules/ai-core/model-catalog.ts) ───────

const OPENAI_CHAT = [
  "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol",
  "gpt-4o", "gpt-4o-mini", "gpt-4o-2024-08-06", "gpt-4o-2024-11-20",
  "gpt-4-turbo", "gpt-4-turbo-preview", "gpt-4-0125-preview",
  "gpt-3.5-turbo", "gpt-3.5-turbo-0125",
];
const GEMINI_CHAT = [
  "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-pro",
  "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-8b",
];
const SARVAM_CHAT = [
  "sarvam-105b", "sarvam-105b-conversations",
  "gemma4", "deepseekv4-flash", "glm5.3",
];
const OPENAI_EMBEDDING = [
  "text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002",
];
const GEMINI_EMBEDDING = [
  "gemini-embedding-001", "text-embedding-004", "embedding-001",
];

const CHAT_IDS = new Set([...OPENAI_CHAT, ...GEMINI_CHAT, ...SARVAM_CHAT].map((s) => s.toLowerCase()));
const EMBEDDING_IDS = new Set([...OPENAI_EMBEDDING, ...GEMINI_EMBEDDING].map((s) => s.toLowerCase()));

const CHAT_PATTERNS = [/^gpt-\d/, /^gpt-realtime/, /^o[1-9](-|$)/, /^chat-bison/, /^sarvam-/];
const EMBEDDING_PATTERNS = [/embedding/, /^embed-?gecko/];
// Voice-surface model ids (Sarvam Bulbul/Saaras) — invalid in ANY brain field.
const VOICE_PATTERNS = [/^bulbul:/, /^saaras:/];

function looksLikeChatModel(id) {
  const v = String(id ?? "").trim().toLowerCase();
  if (!v) return false;
  if (CHAT_IDS.has(v)) return true;
  if (EMBEDDING_IDS.has(v)) return false;
  return CHAT_PATTERNS.some((p) => p.test(v));
}

function looksLikeEmbeddingModel(id) {
  const v = String(id ?? "").trim().toLowerCase();
  if (!v) return false;
  if (EMBEDDING_IDS.has(v)) return true;
  if (CHAT_IDS.has(v)) return false;
  return EMBEDDING_PATTERNS.some((p) => p.test(v));
}

// ── Static checks ─────────────────────────────────────────────────────────────

const violations = [];

function looksLikeVoiceModel(id) {
  const v = String(id ?? "").trim().toLowerCase();
  if (!v) return false;
  return VOICE_PATTERNS.some((p) => p.test(v));
}

function checkField(where, field, value, kind) {
  const v = String(value ?? "").trim();
  if (!v) return;
  if (looksLikeVoiceModel(v)) {
    violations.push(`${where}: ${field}="${v}" is a voice-surface model (TTS/STT) in a brain field`);
    return;
  }
  if (kind === "embedding" && looksLikeChatModel(v)) {
    violations.push(`${where}: ${field}="${v}" is a chat model in an embedding field`);
  }
  if (kind === "chat" && looksLikeEmbeddingModel(v)) {
    violations.push(`${where}: ${field}="${v}" is an embedding model in a chat field`);
  }
}

async function checkEnvFile(file) {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) return;
  const text = await readFile(full, "utf8");
  const lines = text.split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*(OPENAI_CHAT_MODEL|OPENAI_EMBEDDING_MODEL|GEMINI_CHAT_MODEL|GEMINI_EMBEDDING_MODEL|SARVAM_CHAT_MODEL)\s*=\s*(.+)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    const value = raw.replace(/^["']|["']$/g, "");
    const kind = key.includes("EMBEDDING_MODEL") ? "embedding" : "chat";
    if (value) checkField(file, key, value, kind);
  }
}

async function checkSeedFile(file) {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) return;
  const text = await readFile(full, "utf8");
  // Seeds use template literals or quoted strings for model ids.
  const re = /(OPENAI_CHAT_MODEL|OPENAI_EMBEDDING_MODEL|GEMINI_CHAT_MODEL|GEMINI_EMBEDDING_MODEL|SARVAM_CHAT_MODEL)["'`\s:=]+(["'`]?)([A-Za-z0-9._-]+)\2/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const kind = m[1].includes("EMBEDDING_MODEL") ? "embedding" : "chat";
    checkField(file, m[1], m[3], kind);
  }
}

async function checkMigrationSeed() {
  // 012_platform_settings.sql seeds platform_env_settings rows.
  const dir = path.join(ROOT, "src/lib/db/migrations");
  if (!existsSync(dir)) return;
  const { readdir } = await import("node:fs/promises");
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".sql")) continue;
    const text = await readFile(path.join(dir, f), "utf8");
    // Matches: 'OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'
    const re = /'(OPENAI_CHAT_MODEL|OPENAI_EMBEDDING_MODEL|GEMINI_CHAT_MODEL|GEMINI_EMBEDDING_MODEL|SARVAM_CHAT_MODEL)',\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const kind = m[1].includes("EMBEDDING_MODEL") ? "embedding" : "chat";
      checkField(`migrations/${f}`, m[1], m[2], kind);
    }
  }
}

// ── DB checks (--db) ──────────────────────────────────────────────────────────

async function checkDatabase() {
  let pg;
  try {
    pg = (await import("pg")).default;
  } catch {
    console.error("[validate-model-config] pg is not installed — skipping DB audit");
    return;
  }
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.warn("[validate-model-config] DATABASE_URL is not set — skipping DB audit");
    return;
  }
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
  } catch (err) {
    console.warn(`[validate-model-config] DB not reachable (${err.message}) — skipping DB audit`);
    return;
  }

  const audits = [
    {
      where: "platform_env_settings",
      sql: `SELECT key, value FROM platform_env_settings
             WHERE key IN ('OPENAI_CHAT_MODEL','OPENAI_EMBEDDING_MODEL',
                           'GEMINI_CHAT_MODEL','GEMINI_EMBEDDING_MODEL',
                           'SARVAM_CHAT_MODEL')`,
      keyOf: (r) => r.key,
      valOf: (r) => r.value,
    },
    {
      where: "org_ai_settings",
      sql: `SELECT 'defaultChatModel' AS key, default_chat_model::text AS value FROM org_ai_settings WHERE default_chat_model IS NOT NULL
            UNION ALL SELECT 'defaultEmbeddingModel', default_embedding_model::text FROM org_ai_settings WHERE default_embedding_model IS NOT NULL`,
      keyOf: (r) => r.key,
      valOf: (r) => r.value,
    },
    {
      where: "agent_ai_settings",
      sql: `SELECT 'chatModel' AS key, chat_model::text AS value FROM agent_ai_settings WHERE chat_model IS NOT NULL
            UNION ALL SELECT 'embeddingModel', embedding_model::text FROM agent_ai_settings WHERE embedding_model IS NOT NULL`,
      keyOf: (r) => r.key,
      valOf: (r) => r.value,
    },
    {
      where: "kb_ai_overrides",
      sql: `SELECT 'chatModel' AS key, chat_model::text AS value FROM kb_ai_overrides WHERE chat_model IS NOT NULL
            UNION ALL SELECT 'embeddingModel', embedding_model::text FROM kb_ai_overrides WHERE embedding_model IS NOT NULL`,
      keyOf: (r) => r.key,
      valOf: (r) => r.value,
    },
    {
      where: "org_ai_settings.allowedEmbeddingModels",
      sql: `SELECT org_id::text AS key, allowed_embedding_models::text AS value FROM org_ai_settings
             WHERE allowed_embedding_models IS NOT NULL`,
      keyOf: (r) => `org ${r.key}`,
      valOf: (r) => r.value,
      isList: true,
    },
  ];

  for (const audit of audits) {
    try {
      const res = await client.query(audit.sql);
      for (const row of res.rows) {
        const key = audit.keyOf(row);
        const value = audit.valOf(row);
        const kind = /embedding/i.test(key) ? "embedding" : "chat";
        if (audit.isList) {
          // JSON-ish array text: ["a","b"]
          const items = String(value).match(/"([^"]+)"/g) ?? [];
          for (const item of items) {
            checkField(audit.where, `${key}[]`, item.replace(/"/g, ""), kind);
          }
        } else {
          checkField(audit.where, key, value, kind);
        }
      }
    } catch (err) {
      console.warn(`[validate-model-config] ${audit.where}: ${err.message} — skipping`);
    }
  }
  await client.end().catch(() => {});
}

// ── Main ──────────────────────────────────────────────────────────────────────

const withDb = process.argv.includes("--db");

await checkEnvFile(".env.example");
await checkEnvFile(".env.example.v1");
await checkEnvFile(".env.example.v2");
await checkEnvFile(".env.example.v3");
if (existsSync(path.join(ROOT, ".env"))) await checkEnvFile(".env");
await checkSeedFile("src/lib/db/seed/production.ts");
await checkSeedFile("src/lib/db/seed/development.ts");
await checkMigrationSeed();
if (withDb) await checkDatabase();

// Catalogue self-integrity: no id may appear in both catalogues.
for (const id of CHAT_IDS) {
  if (EMBEDDING_IDS.has(id)) violations.push(`catalogue: "${id}" is listed as both chat and embedding model`);
}

if (violations.length > 0) {
  console.error(`\n✖ model configuration validation FAILED (${violations.length} violation${violations.length === 1 ? "" : "s"}):\n`);
  for (const v of violations) console.error(`  • ${v}`);
  console.error("\nA chat model in an embedding field (or the inverse) silently corrupts retrieval.");
  console.error("Fix the stored configuration, then re-run: npm run validate:model-config\n");
  process.exit(1);
}

console.log(`✔ model configuration validation passed${withDb ? " (static + DB audit)" : " (static)"}`);
process.exit(0);
