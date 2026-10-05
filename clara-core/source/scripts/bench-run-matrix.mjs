/**
 * scripts/bench-run-matrix.mjs — runs the voice benchmark harness over every
 * question WAV of a class and aggregates p50/p95 per stage (plan §11/§12).
 *
 * One run = one question (the WAVs carry 30s trailing silence so the
 * fake-capture loop never chains a second utterance inside the window).
 * Reuses scripts/voice-benchmark/run.mjs per file and merges its JSON.
 *
 * Usage:
 *   node scripts/bench-run-matrix.mjs --provider=sarvam --class=kb \
 *     [--key=clr_...] [--url=http://127.0.0.1:3100] [--run-ms=34000]
 *
 * Output: tool-results/voice-bench/<provider>-<class>-matrix.json
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(Math.max(Math.ceil((p / 100) * sorted.length), 1), sorted.length);
  return sorted[rank - 1];
}

const provider = arg("provider", "sarvam");
const questionClass = arg("class", "short");
const baseUrl = arg("url", "http://127.0.0.1:3100");
const runMs = arg("run-ms", "34000");
const apiKey = arg("key", readFileSync("/tmp/embed-key.txt", "utf-8").trim());

/** Restart the benchmark server: the in-memory rate limiter
 *  (REALTIME_SESSION_RATE = 10/hour/org) would 429 the session bootstrap
 *  once a class exceeds 10 questions — each matrix class restarts the
 *  server first so the bucket starts clean. Waits for HTTP readiness. */
function restartServer() {
  const pidfile = "/home/z/clara-server.pid";
  spawnSync("/usr/sbin/start-stop-daemon", ["--stop", "--pidfile", pidfile], { encoding: "utf-8" });
  spawnSync("sleep", ["2"]);
  spawnSync(
    "/usr/sbin/start-stop-daemon",
    ["--start", "--background", "--make-pidfile", "--pidfile", pidfile,
     "--exec", "/home/z/my-project/.worktrees/vc/scripts/bench-server.sh"],
    { encoding: "utf-8" },
  );
  for (let i = 0; i < 20; i++) {
    spawnSync("sleep", ["1.5"]);
    const probe = spawnSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "4", `${baseUrl}/`], { encoding: "utf-8" });
    if (probe.stdout.trim() === "200") return true;
  }
  return false;
}

const questionsDir = resolve("tool-results/voice-bench/questions", questionClass);
if (!existsSync(questionsDir)) {
  console.error(`[matrix] no questions dir for class "${questionClass}"`);
  process.exit(1);
}
const wavs = readdirSync(questionsDir).filter((f) => f.endsWith(".wav")).sort();
console.log(`[matrix] provider=${provider} class=${questionClass} questions=${wavs.length} runMs=${runMs}`);
if (process.env.BENCH_NO_RESTART !== "1") {
  console.log("[matrix] restarting server (clears the in-memory realtime session rate bucket)…");
  if (!restartServer()) { console.error("[matrix] server did not come back up"); process.exit(1); }
  console.log("[matrix] server ready");
}

const turns = [];
const failures = [];

for (const [index, wav] of wavs.entries()) {
  // Mid-batch restart every 9 questions: the realtime session route allows
  // 10/hour/org and each question run boots one session.
  if (index > 0 && index % 9 === 0 && process.env.BENCH_NO_RESTART !== "1") {
    console.log(`[matrix] mid-batch restart before question ${index + 1} (session rate bucket)`);
    if (!restartServer()) { console.error("[matrix] server did not come back up"); process.exit(1); }
  }
  const outPath = resolve("tool-results/voice-bench", `.single-${provider}-${questionClass}-${wav}.json`);
  const res = spawnSync(
    "node",
    [
      "scripts/voice-benchmark/run.mjs",
      `--url=${baseUrl}/embed/voice?key=${apiKey}`,
      `--input=wav:${resolve(questionsDir, wav)}`,
      `--provider=${provider}`,
      `--out=${outPath}`,
    ],
    { env: { ...process.env, BENCH_RUN_MS: String(runMs) }, encoding: "utf-8", timeout: 120_000 },
  );
  const tail = (res.stdout ?? "").split("\n").filter((l) => l.includes("turn ") || l.includes("TTFA"));
  console.log(`[matrix] ${wav} → ${tail.join(" | ") || "no output"}`);
  if (res.status !== 0) {
    failures.push({ wav, error: (res.stderr ?? "").slice(0, 200) });
    continue;
  }
  try {
    const single = JSON.parse(readFileSync(outPath, "utf-8"));
    // Only turns with a real committed user question (greeting records carry
    // no stt marks / ttfa) — keep every event for the raw log.
    for (const t of single.raw ?? []) {
      if (t.latencies?.ttfaMs != null || t.marks?.["stt.final"] != null) turns.push(t);
      else if (t.marks?.["turn.start"] != null && t.generationId != null) turns.push(t);
    }
  } catch (e) {
    failures.push({ wav, error: `parse: ${e.message}` });
  }
}

const pick = (stage) => turns.map((t) => t.latencies?.[stage]).filter((v) => typeof v === "number");
const summary = {
  capturedAt: new Date().toISOString(),
  provider,
  questionClass,
  environment: "headless Chromium 141 (container) + file-mixed fake microphone; Sarvam STT/LLM/TTS live; RAG embedding = local MiniLM stand-in (OpenAI/Gemini region-blocked)",
  questions: wavs.length,
  turns: turns.length,
  failures,
  ttfa: { p50: percentile(pick("ttfaMs"), 50), p95: percentile(pick("ttfaMs"), 95) },
  stages: Object.fromEntries(
    ["sttMs", "ragMs", "llmMs", "ttsMs", "playbackMs"].map((stage) => [
      stage,
      { p50: percentile(pick(stage), 50), p95: percentile(pick(stage), 95) },
    ]),
  ),
  raw: turns,
};

const outPath = resolve("tool-results/voice-bench", `${provider}-${questionClass}-matrix.json`);
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(`[matrix] wrote ${outPath}`);
console.log(`[matrix] turns=${turns.length} failures=${failures.length}`);
console.log(`[matrix] TTFA p50/p95: ${summary.ttfa.p50}/${summary.ttfa.p95} ms`);
for (const [stage, s] of Object.entries(summary.stages)) {
  console.log(`[matrix] ${stage}: p50/p95 ${s.p50}/${s.p95} ms`);
}
