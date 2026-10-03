/**
 * src/modules/voice-core/realtime/relay-url.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Same-origin relay WebSocket URL builder (gap-closure Phase D).
 *
 * The browser-side realtime relays (Sarvam, ElevenLabs Mode C, Gemini) are
 * addressed as ws(s)://<CURRENT-ORIGIN>/<endpoint>?token=<session HMAC token>.
 * Building that URL from a capability descriptor — instead of receiving a
 * vendor URL with an embedded long-lived key — is what keeps vendor
 * credentials out of the browser: the only secret in the URL is the
 * short-lived, capability-scoped session token minted by the platform.
 *
 * Pure module — browser hooks and tests share it.
 */

/** Descriptor returned by the session routes for every relayed voice provider. */
export interface RelayEndpointDescriptor {
  /** Same-origin path, e.g. "/api/voice/gemini/realtime". */
  endpoint: string;
  /** Session-minted HMAC token (v1.<exp>.<kb>.<org>.<sig>). */
  token: string;
}

/**
 * Build the relay WS URL for the CURRENT browser origin:
 *   https://host  → wss://host<endpoint>?token=…
 *   http://host   → ws://host<endpoint>?token=…
 *
 * `originOverride` lets tests pin an origin; production callers omit it.
 */
export function buildSameOriginRelayWsUrl(
  descriptor: RelayEndpointDescriptor,
  originOverride?: string,
): string {
  const base =
    originOverride ??
    (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const url = new URL(descriptor.endpoint, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", descriptor.token);
  return url.toString();
}
