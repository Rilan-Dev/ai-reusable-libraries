import fs from "fs";
import path from "path";

export type RagMode = "classic" | "hybrid" | "agentic";

export type RagRuntimeConfig = {
  requestedMode: RagMode;
  ragMode: RagMode;
  enableGraphRag: boolean;
  enableAgentLoop: boolean;
  enableSelfEval: boolean;
  enableMcp: boolean;
  graphStoreProvider: string;
};

let cachedEnv: Record<string, string> | null = null;
let lastEnvMtime = 0;

function getLiveEnv(): Record<string, string> {
  const envPath = path.join(process.cwd(), ".env");
  try {
    if (!fs.existsSync(envPath)) return {};
    const stat = fs.statSync(envPath);
    if (cachedEnv && stat.mtimeMs === lastEnvMtime) {
      return cachedEnv;
    }
    const content = fs.readFileSync(envPath, "utf-8");
    const env: Record<string, string> = {};
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[match[1].trim()] = val;
      }
    });
    cachedEnv = env;
    lastEnvMtime = stat.mtimeMs;
    return env;
  } catch {
    return {};
  }
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeRagMode(value: unknown): RagMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "classic" || normalized === "hybrid" || normalized === "agentic") return normalized;
  return null;
}

export function getRagRuntimeConfig(options?: { requestedMode?: unknown }): RagRuntimeConfig {
  const liveEnv = getLiveEnv();
  const getEnv = (key: string): string | undefined => {
    return liveEnv[key] ?? process.env[key];
  };


  const envMode = normalizeRagMode(getEnv("RAG_MODE")) ?? "classic";
  const requestedMode = normalizeRagMode(options?.requestedMode) ?? envMode;
  const enableGraphRag = parseBooleanEnv(getEnv("ENABLE_GRAPH_RAG"), requestedMode !== "classic");
  const enableAgentLoop = parseBooleanEnv(getEnv("ENABLE_AGENT_LOOP"), requestedMode === "agentic");
  const enableSelfEval = parseBooleanEnv(getEnv("ENABLE_SELF_EVAL"), requestedMode === "agentic");
  const enableMcp = parseBooleanEnv(getEnv("ENABLE_MCP"), false);

  let ragMode: RagMode = requestedMode;
  if (ragMode === "agentic" && !enableAgentLoop) ragMode = enableGraphRag ? "hybrid" : "classic";
  if (ragMode === "hybrid" && !enableGraphRag) ragMode = "classic";

  return {
    requestedMode,
    ragMode,
    enableGraphRag,
    enableAgentLoop,
    enableSelfEval,
    enableMcp,
    graphStoreProvider: getEnv("GRAPH_STORE_PROVIDER") ?? "memory",
  };
}
