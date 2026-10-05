/**
 * scripts/dev-relay.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Local development voice relay.
 * Run alongside `npm run dev` in a second terminal:
 *
 *   cd clara-backend
 *   node scripts/dev-relay.mjs
 *
 * Starts a WebSocket server on port 3001 (configurable via VOICE_RELAY_PORT).
 * Calls the same handleVoiceConnection() used in production so behaviour is
 * identical. The Next.js dev server on port 3000 handles all HTTP traffic;
 * this relay handles only WebSocket upgrades on port 3001.
 *
 * The frontend reads VITE_CLARA_VOICE_URL=ws://localhost:3001 from
 * amazetechclans-89/.env.development and routes voice WS there.
 */

import http                    from "node:http";
import { WebSocketServer }     from "ws";
import { handleVoiceConnection } from "./voice-relay.mjs";

const RELAY_PORT = Number(process.env.VOICE_RELAY_PORT ?? 3001);

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("[Clara voice relay] OK\n");
});

const wss = new WebSocketServer({ server });
wss.on("connection", handleVoiceConnection);

server.listen(RELAY_PORT, "0.0.0.0", () => {
  console.log(`\n[clara-voice-relay] ✅ Dev relay listening on ws://localhost:${RELAY_PORT}`);
  console.log(`[clara-voice-relay]    WebSocket endpoint: ws://localhost:${RELAY_PORT}/api/embed/voice?key=<your-key>`);
  console.log(`[clara-voice-relay]    Backend (Next.js):  http://localhost:3000\n`);
});

server.on("error", (e) => {
  console.error("[clara-voice-relay] Server error:", e.message);
});
