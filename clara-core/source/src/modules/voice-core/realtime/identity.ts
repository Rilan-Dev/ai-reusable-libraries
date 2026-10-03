/**
 * src/modules/voice-core/realtime/identity.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Realtime session identity primitives (plan Task 2.1).
 *
 *   sessionId     — stable for one connected browser voice session
 *   generationId  — changes for every assistant generation
 *   turnId        — identifies one committed user turn
 *
 * These ids are CORRELATION tokens: they tag audio, transcripts, telemetry and
 * metering so stale generations can be recognised and discarded. They are NOT
 * authorization tokens — every tenant/KB/agent decision is resolved
 * server-side from the authenticated session (JWT or embed key). Client
 * supplied identifiers are never trusted for authorization (plan §2.1 rules).
 *
 * Pure module — no server-only, no browser-only imports — shared by the Node
 * relay paths, the API routes and the React voice hooks.
 */

const SESSION_ID_PREFIX = "vrs_";
const GENERATION_ID_PREFIX = "vrg_";
const TURN_ID_PREFIX = "vrt_";

/** Minimal entropy source that works in Node, browsers and vitest alike. */
function randomToken(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === "function") {
    return g.crypto.randomUUID();
  }
  // Fallback for exotic runtimes without WebCrypto: timestamp + two random
  // blocks. Collision probability stays negligible for per-session minting.
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

/** Stable identity of ONE connected browser voice session. */
export interface RealtimeSessionIdentity {
  readonly sessionId: string;
  /** Opaque org id when known; advisory on the client, authoritative server-side. */
  readonly tenantId: string | null;
  /** Opaque agent id when known; advisory on the client, authoritative server-side. */
  readonly agentId: string | null;
  readonly createdAt: number;
}

export function mintSessionId(): string {
  return SESSION_ID_PREFIX + randomToken();
}

export function mintGenerationId(): string {
  return GENERATION_ID_PREFIX + randomToken();
}

export function mintTurnId(): string {
  return TURN_ID_PREFIX + randomToken();
}

function hasPrefix(
  value: string | null | undefined,
  prefix: string,
): value is string {
  return typeof value === "string" && value.length > prefix.length && value.startsWith(prefix);
}

/** Format checks — used to validate ids arriving from relays or telemetry. */
export function isSessionId(value: string | null | undefined): boolean {
  return hasPrefix(value, SESSION_ID_PREFIX);
}

export function isGenerationId(value: string | null | undefined): boolean {
  return hasPrefix(value, GENERATION_ID_PREFIX);
}

export function isTurnId(value: string | null | undefined): boolean {
  return hasPrefix(value, TURN_ID_PREFIX);
}

export function isRealtimeId(value: string | null | undefined): boolean {
  return isSessionId(value) || isGenerationId(value) || isTurnId(value);
}

/**
 * Create the session identity for a freshly connected voice session.
 * The sessionId is minted here and must remain stable until disconnect.
 */
export function createSessionIdentity(init?: {
  sessionId?: string;
  tenantId?: string | null;
  agentId?: string | null;
  createdAt?: number;
}): RealtimeSessionIdentity {
  const sessionId =
    init?.sessionId && isSessionId(init.sessionId) ? init.sessionId : mintSessionId();
  return {
    sessionId,
    tenantId: init?.tenantId ?? null,
    agentId: init?.agentId ?? null,
    createdAt: init?.createdAt ?? Date.now(),
  };
}
