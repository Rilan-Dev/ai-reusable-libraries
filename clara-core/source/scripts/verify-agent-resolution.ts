/**
 * Runtime verification for the agent-owned assistant config model.
 *
 * Checks that resolveAIConfig works end-to-end:
 *  - KB -> agent resolution (the KB's agent supplies the assistant config)
 *  - the AGENT's assistant_config is the effective config for every KB it owns
 *  - editing the agent config changes what the KB runtime resolves
 *
 * Run: npx tsx scripts/verify-agent-resolution.ts
 */
import fs from "node:fs";
import path from "node:path";

// Load .env manually FIRST — module imports below create the pg pool at
// module evaluation time, so env vars must be set before they run (CJS has
// no top-level await, so dynamic imports happen inside main()).
const envPath = path.join(process.cwd(), ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

type ResolveFn = typeof import("@/modules/ai-core/resolve")["resolveAIConfig"];
type PoolMod = typeof import("@/lib/db");

async function main() {
  const { resolveAIConfig } = (await import("@/modules/ai-core/resolve")) as { resolveAIConfig: ResolveFn };
  const { pool } = (await import("@/lib/db")) as PoolMod;

  // Pick an agent that owns at least one KB and has an assistant config.
  const { rows } = await pool.query<{ agent_id: string; agent_name: string; kb_count: string; assistant_name: string }>(
    `SELECT a.id AS agent_id, a.name AS agent_name,
            COUNT(kb.id)::text AS kb_count, ac.assistant_name
       FROM agents a
       JOIN assistant_configs ac ON ac.agent_id = a.id
       JOIN knowledge_bases kb ON kb.agent_id = a.id
      GROUP BY a.id, a.name, ac.assistant_name
      ORDER BY COUNT(kb.id) DESC
      LIMIT 1`,
  );
  if (rows.length === 0) {
    console.log("No agent with KBs + assistant config found — run the seed first.");
    return;
  }
  const agent = rows[0];
  console.log(`Testing with agent "${agent.agent_name}" (${agent.kb_count} KBs, assistant: ${agent.assistant_name})`);

  // Every KB the agent owns should resolve the SAME agent-level config.
  const { rows: kbRows } = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM knowledge_bases WHERE agent_id = $1 ORDER BY name LIMIT 3",
    [agent.agent_id],
  );

  let allMatch = true;
  for (const kb of kbRows) {
    const resolved = await resolveAIConfig({ kbId: String(kb.id), surface: "chat" });
    const match = resolved.assistantConfig?.agentId === String(agent.agent_id)
      && resolved.assistantConfig?.assistantName === agent.assistant_name;
    console.log(`  KB "${kb.name}" → assistant=${resolved.assistantConfig?.assistantName} (agent config: ${match ? "SHARED ✓" : "MISMATCH ✗"})`);
    if (!match) allMatch = false;
  }

  // Editing the agent config must change what the KB runtime resolves.
  const { rows: origRows } = await pool.query<{ welcome_message: string }>(
    "SELECT welcome_message FROM assistant_configs WHERE agent_id = $1",
    [agent.agent_id],
  );
  const originalWelcome = String(origRows[0]?.welcome_message ?? "");

  await pool.query("UPDATE assistant_configs SET welcome_message = 'Verify: agent config edit' WHERE agent_id = $1", [agent.agent_id]);
  try {
    const after = await resolveAIConfig({ kbId: String(kbRows[0].id), surface: "chat" });
    const editApplied = after.assistantConfig?.welcomeMessage === "Verify: agent config edit";
    console.log(`agent config edit propagates to KB runtime: ${editApplied ? "APPLIED ✓" : "NOT APPLIED ✗"}`);
    if (!editApplied) allMatch = false;
  } finally {
    await pool.query("UPDATE assistant_configs SET welcome_message = $1 WHERE agent_id = $2", [originalWelcome, agent.agent_id]);
    console.log("agent config restored.");
  }

  await pool.end();
  if (!allMatch) {
    console.error("\nVERIFICATION FAILED.");
    process.exit(1);
  }
  console.log("\nRUNTIME RESOLUTION VERIFIED — assistant config is agent-owned and shared by its KBs.");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
