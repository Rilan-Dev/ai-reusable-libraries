/**
 * scripts/gemini-relay.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side Gemini Live relay (gap-closure Phase D).
 *
 *   Browser ⇄ (wss://<self>/api/voice/gemini/realtime?token=<HMAC>) ⇄ Relay
 *           ⇄ (wss://generativelanguage.googleapis.com/…?key=<GEMINI_API_KEY>)
 *
 * Security properties (mirrors the Sarvam / ElevenLabs relay discipline):
 *   • The long-lived GEMINI_API_KEY never leaves the server — the relay builds
 *     the upstream URL itself; the browser never sees it in a response body,
 *     a URL, or a frame.
 *   • The browser authenticates with a session-minted HMAC token
 *     (v1.<expMs>.<kbId>.<orgId>.<sig>, AUTH_SECRET-derived) verified
 *     in-process on every connection.
 *   • TRANSPARENT PASSTHROUGH: the browser speaks the exact same
 *     BidiGenerateContent JSON protocol it spoke before (setup,
 *     realtime_input, client_content, toolResponse …) — the relay pipes frames
 *     verbatim both directions, so the existing useGeminiLive client logic
 *     (WebAudio scheduler, RAG tool round-trips via /api/rag/search) keeps
 *     working unchanged. No protocol translation, no behavior change.
 *
 * Token format and HMAC mirror src/modules/voice-core/api/gemini/realtime-auth.ts
 * (kept in plain JS here like sarvam-relay.mjs / elevenlabs-relay.mjs).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import WebSocket from "ws";

const TOKEN_VERSION = "v1";
const GEMINI_WSS =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

/** Hard cap on one browser-relay connection (token TTL must outlive it). */
const SESSION_LIFETIME_MS = 60 * 60 * 1000; // 60 minutes
/** Close the browser side when it goes quiet (vendor keeps its own pings). */
const IDLE_TIMEOUT_MS = 120 * 1000;

function hmacHex(payload) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** Verify a session-minted browser token (mirrors realtime-auth.ts in TS). */
function verifyToken(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 5 || parts[0] !== TOKEN_VERSION) return null;
  const [, expRaw, kbId, orgId, sig] = parts;
  const expiresAtMs = Number(expRaw);
  if (!Number.isFinite(expiresAtMs)) return null;
  const payload = `${TOKEN_VERSION}.${expRaw}.${kbId}.${orgId}`;
  if (!safeEqualHex(hmacHex(payload), sig)) return null;
  if (Date.now() >= expiresAtMs) return null;
  return { kbId, orgId, expiresAtMs };
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

export async function handleGeminiRealtimeConnection(browserWs, req) {
  const url = new URL(req.url, "http://x");
  const claims = verifyToken(url.searchParams.get("token"));
  if (!claims) {
    send(browserWs, { type: "error", message: "Invalid or expired realtime session token", fatal: true });
    browserWs.close(1008, "Invalid token");
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    send(browserWs, { type: "error", message: "Gemini voice is not configured on the server", fatal: true });
    browserWs.close(1011, "Not configured");
    return;
  }

  // The ONLY place the vendor key is materialised — server-side, never forwarded.
  const upstream = new WebSocket(`${GEMINI_WSS}?key=${geminiKey}`);

  let closed = false;
  const closeBoth = (code = 1000) => {
    if (closed) return;
    closed = true;
    clearTimeout(idleTimer);
    try { if (upstream.readyState === WebSocket.OPEN) upstream.close(code); } catch {}
    try { if (browserWs.readyState === WebSocket.OPEN) browserWs.close(code); } catch {}
  };

  // Idle watchdog: silence on BOTH sides for 120 s means the tab is gone.
  let idleTimer = setTimeout(() => closeBoth(1000), IDLE_TIMEOUT_MS);
  const bumpIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => closeBoth(1000), IDLE_TIMEOUT_MS);
  };

  upstream.on("open", () => {
    send(browserWs, { type: "status", value: "connected" });
  });

  upstream.on("message", (data) => {
    bumpIdle();
    if (browserWs.readyState === WebSocket.OPEN) browserWs.send(data.toString());
  });

  upstream.on("error", (e) => {
    console.error("[gemini-relay] upstream error:", e.message);
    send(browserWs, { type: "error", message: "Gemini upstream connection error", fatal: true });
    closeBoth(1011);
  });

  upstream.on("close", (code) => {
    // Propagate vendor closes so the client hook can surface them/reconnect.
    closeBoth(code || 1000);
  });

  // Browser → upstream: verbatim JSON frames of the BidiGenerateContent
  // protocol (setup / realtime_input / client_content / toolResponse …).
  // The relay never inspects or rewrites them — and never needs to: the
  // browser's frames carry audio + text only, no credentials exist client-side.
  browserWs.on("message", (data) => {
    bumpIdle();
    if (upstream.readyState !== WebSocket.OPEN) return;
    upstream.send(data.toString());
  });

  browserWs.on("close", () => closeBoth(1000));
  browserWs.on("error", () => closeBoth(1011));

  // Hard lifetime cap, mirroring the Sarvam relay session discipline.
  setTimeout(() => closeBoth(1000), SESSION_LIFETIME_MS).unref?.();
}
