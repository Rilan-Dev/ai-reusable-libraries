/**
 * scripts/voice-benchmark/run.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Plan Phase 11 — real-device realtime benchmark harness (Tests A–E).
 *
 * Drives a real browser (Playwright/Chromium) against a running Clara
 * instance with a FAKE microphone (--use-fake-device-for-media-stream) and
 * captures the per-turn latency telemetry the hooks emit
 * (window event "clara:voice:latency", plan Phase 10) to compute p50/p95
 * TTFA per question class.
 *
 * NOTE ON FAKE AUDIO: Chromium's fake mic emits a tone — vendors treat it as
 * non-speech, so VOICE turns will not commit. For real TTFA numbers the
 * harness supports --input=wav:<file>: it mixes a recorded question WAV into
 * the fake device (--use-file-for-fake-audio-capture) so STT sees real
 * speech. Without it, the harness still validates the connect/telemetry
 * plumbing end-to-end.
 *
 * Usage:
 *   node scripts/voice-benchmark/run.mjs \
 *     --url=https://clara.example.com/embed/voice?key=clr_... \
 *     [--input=wav:questions/en/short-01.wav] [--provider=sarvam] \
 *     [--out=tool-results/voice-bench.json]
 *
 * The SAME device/network conditions must be used for every provider
 * compared (plan §12 discipline: never compare providers on one request).
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(Math.max(Math.ceil((p / 100) * sorted.length), 1), sorted.length);
  return sorted[rank - 1];
}

function parseArgs(argv) {
  const args = { url: null, input: null, provider: null, out: "tool-results/voice-bench.json" };
  for (const arg of argv.slice(2)) {
    // split on the FIRST "=" only — URLs carry query strings (?key=clr_…)
    // and split("=") chopped everything after the second "=" (the embed key
    // silently vanished, so the page rendered its keyless error state).
    const raw = arg.replace(/^--/, "");
    const eq = raw.indexOf("=");
    const [key, value] = eq === -1 ? [raw, ""] : [raw.slice(0, eq), raw.slice(eq + 1)];
    if (key === "url") args.url = value;
    if (key === "input") args.input = value;
    if (key === "provider") args.provider = value;
    if (key === "out") args.out = value;
  }
  if (!args.url) {
    console.error("usage: node scripts/voice-benchmark/run.mjs --url=<widget-or-voice-url> [--input=wav:<file>] [--provider=<name>] [--out=<file>]");
    process.exit(1);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const launchArgs = [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ];
  let wavFile = null;
  if (args.input?.startsWith("wav:")) {
    wavFile = resolve(args.input.slice(4));
    launchArgs.push(`--use-file-for-fake-audio-capture=${wavFile}`);
  }

  const browser = await chromium.launch({ args: launchArgs });
  const page = await browser.newPage();

  // Collect the Phase 10 telemetry events.
  const turns = [];
  await page.exposeFunction("__claraBenchPush", (event) => {
    turns.push(event);
    console.log(
      `[bench] turn provider=${event.provider} ttfa=${event.latencies?.ttfaMs ?? "n/a"}ms ` +
        `stt=${event.latencies?.sttMs ?? "n/a"} rag=${event.latencies?.ragMs ?? "n/a"} ` +
        `llm=${event.latencies?.llmMs ?? "n/a"} tts=${event.latencies?.ttsMs ?? "n/a"} ` +
        `playback=${event.latencies?.playbackMs ?? "n/a"}`,
    );
  });
  await page.addInitScript(() => {
    window.addEventListener("clara:voice:latency", (event) => {
      // Serialization-safe copy of the detail.
      const d = event.detail;
      window.__claraBenchPush({
        sessionId: d.sessionId,
        generationId: d.generationId,
        turnId: d.turnId,
        provider: d.provider,
        model: d.model,
        marks: d.marks,
        latencies: d.latencies,
      });
    });
  });

  console.log(`[bench] opening ${args.url}`);
  await page.goto(args.url, { waitUntil: "networkidle", timeout: 60_000 });

  // Connect the voice session (the mic permission is auto-granted).
  // waitFor (not an instant count) — the embed surfaces are client-rendered,
  // so the connect button may appear a beat after networkidle; an instant
  // count() raced hydration and silently skipped the click.
  const connectButton = page.locator("button:has-text('Connect'), button:has-text('Start'), button[aria-label*='connect' i]").first();
  try {
    await connectButton.waitFor({ state: "visible", timeout: 15_000 });
    await connectButton.click();
    console.log("[bench] voice session connect clicked");
  } catch {
    console.log("[bench] NOTE | no connect button found — assuming auto-connecting surface");
  }

  // Let the session run (greeting + any turns triggered by the fake/recorded
  // audio). With a recorded question WAV the vendor commits a transcript and
  // the full turn fires; with the tone the plumbing is still validated.
  const RUN_MS = Number(process.env.BENCH_RUN_MS ?? 60_000);
  console.log(`[bench] collecting telemetry for ${RUN_MS / 1000}s…`);
  await page.waitForTimeout(RUN_MS);

  await browser.close();

  // ── Aggregate p50/p95 (plan §11: TTFA = browser.first_audio - stt.final). ──
  const ttfa = turns.map((t) => t.latencies?.ttfaMs).filter((v) => typeof v === "number");
  const stages = {};
  for (const stage of ["sttMs", "ragMs", "llmMs", "ttsMs", "playbackMs"]) {
    stages[stage] = turns.map((t) => t.latencies?.[stage]).filter((v) => typeof v === "number");
  }
  const summary = {
    capturedAt: new Date().toISOString(),
    provider: args.provider ?? null,
    input: args.input ?? "fake-tone",
    turns: turns.length,
    ttfa: { p50: percentile(ttfa, 50), p95: percentile(ttfa, 95) },
    stages: Object.fromEntries(
      Object.entries(stages).map(([stage, values]) => [
        stage,
        { p50: percentile(values, 50), p95: percentile(values, 95) },
      ]),
    ),
    raw: turns,
  };

  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`[bench] wrote ${outPath}`);
  console.log("[bench] TTFA p50/p95:", summary.ttfa.p50, "/", summary.ttfa.p95, "ms over", turns.length, "turns");
  if (turns.length === 0) {
    console.log(
      "[bench] NOTE | zero turns captured — expected with the fake-tone mic (vendors treat it as " +
        "non-speech). Re-run with --input=wav:<recorded-question.wav> for real TTFA numbers, " +
        "using the SAME device/network for every provider compared (plan §12).",
    );
  }
}

main().catch((err) => {
  console.error("[bench] failed:", err.message);
  process.exit(1);
});
