/**
 * src/modules/ai-core/resolve-cache.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stale-while-revalidate cache for resolveAIConfig on the chat hot path.
 *
 * Resolving a tenant's AI configuration costs ~10 database round trips
 * (KB, agent, draft/version, deployment, org/agent settings, overrides,
 * registry, entitlements). On a single-connection serverless pool they run
 * back to back in front of every voice/chat turn. A resolution is reused for
 * AI_CONFIG_CACHE_FRESH_MS (default 10 s); after that the cached value is
 * served while a background refresh runs, so an edit reaches the next turn.
 * Older than 5 minutes → resolved synchronously. A refresh that FAILS (e.g.
 * the provider was disabled or the plan changed) evicts the entry so the
 * next turn surfaces the error instead of serving stale access.
 */

import { resolveAIConfig } from "./resolve";

type Input = Parameters<typeof resolveAIConfig>[0];
type Resolved = Awaited<ReturnType<typeof resolveAIConfig>>;

const MAX_STALE_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: Resolved; at: number }>();
const inFlight = new Map<string, Promise<Resolved>>();

function freshMs(): number {
  const value = Number(process.env.AI_CONFIG_CACHE_FRESH_MS);
  return Number.isFinite(value) && value >= 0 ? value : 10_000;
}

function load(key: string, input: Input): Promise<Resolved> {
  const pending = inFlight.get(key);
  if (pending) return pending;
  const run = resolveAIConfig(input)
    .then((value) => {
      cache.set(key, { value, at: Date.now() });
      if (cache.size > 1000) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      return value;
    })
    .catch((error: unknown) => {
      cache.delete(key);
      throw error;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

export async function resolveAIConfigCached(input: Input): Promise<Resolved> {
  const key = JSON.stringify(input);
  const entry = cache.get(key);
  const age = entry ? Date.now() - entry.at : Infinity;
  if (entry && age < freshMs()) return entry.value;
  if (entry && age < MAX_STALE_MS) {
    load(key, input).catch((error: unknown) =>
      console.warn("[ai-config] background refresh failed:", (error as Error)?.message ?? error),
    );
    return entry.value;
  }
  return load(key, input);
}

/** Test hook. */
export function clearResolveAIConfigCache(): void {
  cache.clear();
  inFlight.clear();
}
