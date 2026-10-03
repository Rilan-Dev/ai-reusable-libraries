/**
 * src/modules/agent-versioning/core/db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Database access for agent_branches / agent_versions / agent_drafts /
 * agent_deployments. Immutability of agent_versions is enforced BY CONSTRUCTION:
 * no UPDATE path exists for configuration_json — only published_at may be set.
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, execute, withTransaction } from "@/lib/db";
import type {
  AgentBranch,
  AgentDeployment,
  AgentDraft,
  AgentVersion,
  AgentVersionConfig,
} from "./types";

type Row = Record<string, unknown>;

export class AgentVersioningError extends Error {
  constructor(message: string, readonly code: string = "AGENT_VERSIONING_ERROR") {
    super(message);
    this.name = "AgentVersioningError";
  }
}

export function parseVersionConfig(value: unknown): AgentVersionConfig {
  if (!value || typeof value !== "object") {
    throw new AgentVersioningError("Version configuration is missing or invalid.", "VERSION_CONFIG_INVALID");
  }
  return value as AgentVersionConfig;
}

// ─── Branches ─────────────────────────────────────────────────────────────────

const BRANCH_SELECT = `
  SELECT b.*, b2.version_number AS forked_from_version_number,
         u.full_name AS created_by_name,
         lv.version_number AS latest_version_number,
         d.updated_at AS draft_updated_at
    FROM agent_branches b
    LEFT JOIN agent_versions b2 ON b2.id = b.forked_from_version_id
    LEFT JOIN users u ON u.id = b.created_by
    LEFT JOIN LATERAL (
      SELECT version_number FROM agent_versions v WHERE v.branch_id = b.id
      ORDER BY version_number DESC LIMIT 1
    ) lv ON TRUE
    LEFT JOIN LATERAL (
      SELECT updated_at FROM agent_drafts d WHERE d.branch_id = b.id LIMIT 1
    ) d ON TRUE
`;

function toBranch(row: Row): AgentBranch {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    orgId: String(row.org_id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    isMain: Boolean(row.is_main),
    isArchived: Boolean(row.is_archived),
    forkedFromVersionId: row.forked_from_version_id == null ? null : String(row.forked_from_version_id),
    forkedFromVersionNumber:
      row.forked_from_version_number == null ? null : Number(row.forked_from_version_number),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdByName: row.created_by_name == null ? null : String(row.created_by_name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    latestVersionNumber: row.latest_version_number == null ? null : Number(row.latest_version_number),
    draftUpdatedAt: row.draft_updated_at == null ? null : String(row.draft_updated_at),
  };
}

export async function listBranches(agentId: string): Promise<AgentBranch[]> {
  const rows = await query<Row>(
    `${BRANCH_SELECT}
      WHERE b.agent_id = $1
      ORDER BY b.is_main DESC, b.created_at ASC`,
    [agentId],
  );
  return rows.map(toBranch);
}

export async function getBranch(agentId: string, branchId: string): Promise<AgentBranch | null> {
  const row = await queryOne<Row>(
    `${BRANCH_SELECT} WHERE b.agent_id = $1 AND b.id = $2`,
    [agentId, branchId],
  );
  return row ? toBranch(row) : null;
}

export async function getBranchByName(agentId: string, name: string): Promise<AgentBranch | null> {
  const row = await queryOne<Row>(
    `${BRANCH_SELECT} WHERE b.agent_id = $1 AND b.name = $2`,
    [agentId, name],
  );
  return row ? toBranch(row) : null;
}

export async function getMainBranch(agentId: string): Promise<AgentBranch | null> {
  const row = await queryOne<Row>(
    `${BRANCH_SELECT} WHERE b.agent_id = $1 AND b.is_main`,
    [agentId],
  );
  return row ? toBranch(row) : null;
}

/** Create the permanent Main branch (idempotent, race-safe). */
export async function ensureMainBranch(agentId: string, orgId: string, createdBy?: string | null): Promise<AgentBranch> {
  await execute(
    `INSERT INTO agent_branches (id, agent_id, org_id, name, description, is_main, created_by)
     VALUES ($1, $2, $3, 'Main', 'Permanent mainline branch.', TRUE, $4)
     ON CONFLICT (agent_id, name) DO NOTHING`,
    [randomUUID(), agentId, orgId, createdBy ?? null],
  );
  const main = await getMainBranch(agentId);
  if (!main) throw new AgentVersioningError("Failed to create Main branch.", "MAIN_CREATE_FAILED");
  return main;
}

export async function createBranch(input: {
  agentId: string;
  orgId: string;
  name: string;
  description?: string | null;
  forkedFromVersionId: string | null;
  forkedFromVersionIdOnBranch?: string | null;
  createdBy: string | null;
}): Promise<AgentBranch> {
  const existing = await getBranchByName(input.agentId, input.name);
  if (existing) {
    throw new AgentVersioningError(`Branch "${input.name}" already exists for this agent.`, "BRANCH_EXISTS");
  }
  if (/^main$/i.test(input.name.trim())) {
    throw new AgentVersioningError("The Main branch already exists and is permanent.", "BRANCH_NAME_RESERVED");
  }
  const id = randomUUID();
  const row = await queryOne<Row>(
    `INSERT INTO agent_branches (id, agent_id, org_id, name, description, forked_from_version_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [id, input.agentId, input.orgId, input.name.trim(), input.description?.trim() || null, input.forkedFromVersionId, input.createdBy],
  );
  const branch = await getBranch(input.agentId, String(row!.id));
  if (!branch) throw new AgentVersioningError("Failed to create branch.", "BRANCH_CREATE_FAILED");
  return branch;
}

export async function setBranchArchived(agentId: string, branchId: string, archived: boolean): Promise<void> {
  const branch = await getBranch(agentId, branchId);
  if (!branch) throw new AgentVersioningError("Branch not found.", "BRANCH_NOT_FOUND");
  if (branch.isMain) throw new AgentVersioningError("The Main branch cannot be archived.", "BRANCH_MAIN_IMMUTABLE");
  await execute(
    "UPDATE agent_branches SET is_archived = $3, updated_at = now() WHERE id = $1 AND agent_id = $2",
    [branchId, agentId, archived],
  );
}

// ─── Versions (immutable) ─────────────────────────────────────────────────────

const VERSION_SELECT = `
  SELECT v.*, b.name AS branch_name, u.full_name AS created_by_name
    FROM agent_versions v
    JOIN agent_branches b ON b.id = v.branch_id
    LEFT JOIN users u ON u.id = v.created_by
`;

function toVersion(row: Row): AgentVersion {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    orgId: String(row.org_id),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name),
    versionNumber: Number(row.version_number),
    parentVersionId: row.parent_version_id == null ? null : String(row.parent_version_id),
    configuration: parseVersionConfig(row.configuration_json),
    changeSummary: row.change_summary == null ? null : String(row.change_summary),
    source: String(row.source) as AgentVersion["source"],
    createdByName: row.created_by_name == null ? null : String(row.created_by_name),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: String(row.created_at),
    publishedAt: row.published_at == null ? null : String(row.published_at),
  };
}

export async function listVersions(agentId: string, branchId?: string): Promise<AgentVersion[]> {
  const rows = branchId
    ? await query<Row>(
        `${VERSION_SELECT} WHERE v.agent_id = $1 AND v.branch_id = $2 ORDER BY v.created_at DESC, v.version_number DESC`,
        [agentId, branchId],
      )
    : await query<Row>(
        `${VERSION_SELECT} WHERE v.agent_id = $1 ORDER BY v.created_at DESC, v.version_number DESC`,
        [agentId],
      );
  return rows.map(toVersion);
}

export async function getVersion(agentId: string, versionId: string): Promise<AgentVersion | null> {
  const row = await queryOne<Row>(
    `${VERSION_SELECT} WHERE v.agent_id = $1 AND v.id = $2`,
    [agentId, versionId],
  );
  return row ? toVersion(row) : null;
}

export async function getLatestVersion(agentId: string, branchId: string): Promise<AgentVersion | null> {
  const row = await queryOne<Row>(
    `${VERSION_SELECT} WHERE v.agent_id = $1 AND v.branch_id = $2 ORDER BY v.version_number DESC LIMIT 1`,
    [agentId, branchId],
  );
  return row ? toVersion(row) : null;
}

async function nextVersionNumber(branchId: string): Promise<number> {
  const row = await queryOne<{ max: number | null }>(
    "SELECT max(version_number) AS max FROM agent_versions WHERE branch_id = $1",
    [branchId],
  );
  return (row?.max ?? 0) + 1;
}

/** Insert a new immutable version. NO update path exists for configuration_json. */
export async function insertVersion(input: {
  agentId: string;
  orgId: string;
  branchId: string;
  configuration: AgentVersionConfig;
  changeSummary?: string | null;
  source: AgentVersion["source"];
  parentVersionId?: string | null;
  createdBy?: string | null;
  createdAt?: Date;
}): Promise<AgentVersion> {
  const versionNumber = await nextVersionNumber(input.branchId);
  const id = randomUUID();
  const row = await queryOne<Row>(
    `INSERT INTO agent_versions
       (id, agent_id, org_id, branch_id, version_number, parent_version_id,
        configuration_json, change_summary, source, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
     RETURNING id`,
    [
      id,
      input.agentId,
      input.orgId,
      input.branchId,
      versionNumber,
      input.parentVersionId ?? null,
      JSON.stringify(input.configuration),
      input.changeSummary?.trim() || null,
      input.source,
      input.createdBy ?? null,
      input.createdAt ?? new Date(),
    ],
  );
  const version = await getVersion(input.agentId, String(row!.id));
  if (!version) throw new AgentVersioningError("Failed to create version.", "VERSION_CREATE_FAILED");
  return version;
}

// ─── Drafts (mutable, one per branch) ─────────────────────────────────────────

const DRAFT_SELECT = `
  SELECT d.*, b.name AS branch_name, pv.version_number AS parent_version_number
    FROM agent_drafts d
    JOIN agent_branches b ON b.id = d.branch_id
    LEFT JOIN agent_versions pv ON pv.id = d.parent_version_id
`;

function toDraft(row: Row): AgentDraft {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    orgId: String(row.org_id),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name),
    userId: row.user_id == null ? null : String(row.user_id),
    configuration: parseVersionConfig(row.configuration_json),
    parentVersionId: row.parent_version_id == null ? null : String(row.parent_version_id),
    parentVersionNumber: row.parent_version_number == null ? null : Number(row.parent_version_number),
    updatedAt: String(row.updated_at),
    createdAt: String(row.created_at),
  };
}

export async function getDraft(agentId: string, branchId: string): Promise<AgentDraft | null> {
  const row = await queryOne<Row>(
    `${DRAFT_SELECT} WHERE d.agent_id = $1 AND d.branch_id = $2`,
    [agentId, branchId],
  );
  return row ? toDraft(row) : null;
}

export async function putDraft(input: {
  agentId: string;
  orgId: string;
  branchId: string;
  configuration: AgentVersionConfig;
  parentVersionId?: string | null;
  userId?: string | null;
}): Promise<AgentDraft> {
  const id = randomUUID();
  const row = await queryOne<Row>(
    `INSERT INTO agent_drafts (id, agent_id, org_id, branch_id, user_id, configuration_json, parent_version_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (branch_id) DO UPDATE SET
       user_id = $5,
       configuration_json = $6::jsonb,
       parent_version_id = $7,
       updated_at = now()
     RETURNING id`,
    [
      id,
      input.agentId,
      input.orgId,
      input.branchId,
      input.userId ?? null,
      JSON.stringify(input.configuration),
      input.parentVersionId ?? null,
    ],
  );
  const draft = await getDraft(input.agentId, input.branchId);
  if (!draft) throw new AgentVersioningError("Failed to save draft.", "DRAFT_SAVE_FAILED");
  invalidateAgentDraftCache(input.agentId);
  return draft;
}

// ─── Draft resolution (authenticated preview) ─────────────────────────────────
//
// The dedicated preview surface (/preview/agents/:id) tests the CURRENT
// DRAFT — persona, AI selections, runtime toggles — against the LIVE
// knowledge base. This read-only accessor resolves the Main-branch draft
// without creating anything, behind the same short TTL cache discipline as
// the production version cache so per-request resolution stays cheap while
// draft edits propagate effectively immediately (writes invalidate).

export async function getAgentDraftConfig(agentId: string): Promise<AgentDraft | null> {
  const main = await getMainBranch(agentId);
  if (!main) return null;
  return getDraft(agentId, main.id);
}

const DRAFT_CACHE_TTL_MS = 3_000;
const draftCache = new Map<string, { expiresAt: number; value: AgentDraft | null }>();

export async function getAgentDraftConfigCached(agentId: string): Promise<AgentDraft | null> {
  const hit = draftCache.get(agentId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await getAgentDraftConfig(agentId);
  draftCache.set(agentId, { expiresAt: Date.now() + DRAFT_CACHE_TTL_MS, value });
  if (draftCache.size > 1024) {
    const now = Date.now();
    for (const [k, entry] of draftCache) {
      if (entry.expiresAt <= now) draftCache.delete(k);
    }
  }
  return value;
}

export function invalidateAgentDraftCache(agentId?: string): void {
  if (agentId) draftCache.delete(agentId);
  else draftCache.clear();
}

// ─── Deployments ──────────────────────────────────────────────────────────────

const DEPLOYMENT_SELECT = `
  SELECT dep.*, b.name AS branch_name, v.version_number, v.change_summary, u.full_name AS published_by_name
    FROM agent_deployments dep
    JOIN agent_branches b ON b.id = dep.branch_id
    JOIN agent_versions v ON v.id = dep.version_id
    LEFT JOIN users u ON u.id = dep.published_by
`;

function toDeployment(row: Row): AgentDeployment {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    orgId: String(row.org_id),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name),
    versionId: String(row.version_id),
    versionNumber: Number(row.version_number),
    environment: String(row.environment),
    status: String(row.status) as AgentDeployment["status"],
    publicAccess: Boolean(row.public_access),
    publishedByName: row.published_by_name == null ? null : String(row.published_by_name),
    publishedBy: row.published_by == null ? null : String(row.published_by),
    publishedAt: String(row.published_at),
    changeSummary: row.change_summary == null ? null : String(row.change_summary),
  };
}

export async function getActiveDeployment(agentId: string): Promise<AgentDeployment | null> {
  const row = await queryOne<Row>(
    `${DEPLOYMENT_SELECT} WHERE dep.agent_id = $1 AND dep.status = 'active' AND dep.environment = 'production'`,
    [agentId],
  );
  return row ? toDeployment(row) : null;
}

export async function listDeployments(agentId: string, limit = 20): Promise<AgentDeployment[]> {
  const rows = await query<Row>(
    `${DEPLOYMENT_SELECT} WHERE dep.agent_id = $1 ORDER BY dep.published_at DESC LIMIT $2`,
    [agentId, limit],
  );
  return rows.map(toDeployment);
}

/**
 * Publish an exact immutable version to production. Atomically:
 *  - supersedes the previous active deployment (kept as history),
 *  - stamps the version published_at,
 *  - flips agents.status to 'published'.
 */
export async function insertDeployment(input: {
  agentId: string;
  orgId: string;
  branchId: string;
  versionId: string;
  publicAccess: boolean;
  publishedBy: string | null;
  kbSnapshots?: Array<{ kbId: string; collectionName: string }>;
}): Promise<AgentDeployment> {
  const id = randomUUID();
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE agent_deployments SET status = 'superseded'
        WHERE agent_id = $1 AND environment = 'production' AND status = 'active'`,
      [input.agentId],
    );
    await client.query(
      `INSERT INTO agent_deployments (id, agent_id, org_id, branch_id, version_id, environment, status, public_access, published_by)
       VALUES ($1, $2, $3, $4, $5, 'production', 'active', $6, $7)`,
      [id, input.agentId, input.orgId, input.branchId, input.versionId, input.publicAccess, input.publishedBy],
    );
    for (const snapshot of input.kbSnapshots ?? []) {
      await client.query(
        `INSERT INTO agent_deployment_kb_snapshots (deployment_id, agent_id, kb_id, collection_name)
         VALUES ($1, $2, $3, $4)`,
        [id, input.agentId, snapshot.kbId, snapshot.collectionName],
      );
    }
    await client.query(
      `UPDATE agent_versions SET published_at = now() WHERE id = $1 AND published_at IS NULL`,
      [input.versionId],
    );
    await client.query(
      `UPDATE agents SET status = 'published', updated_at = now() WHERE id = $1 AND status <> 'archived'`,
      [input.agentId],
    );
  });
  const row = await queryOne<Row>(
    `${DEPLOYMENT_SELECT} WHERE dep.id = $1`,
    [id],
  );
  if (!row) throw new AgentVersioningError("Failed to create deployment.", "DEPLOYMENT_CREATE_FAILED");
  return toDeployment(row);
}

/** Return the immutable KB collection captured by the active production deployment. */
export async function getActiveDeploymentKbCollection(agentId: string, kbId: string): Promise<string | null> {
  const row = await queryOne<{ collection_name: string }>(
    "SELECT s.collection_name FROM agent_deployment_kb_snapshots s " +
      "JOIN agent_deployments d ON d.id = s.deployment_id " +
      "WHERE d.agent_id = $1 AND d.environment = 'production' AND d.status = 'active' AND s.kb_id = $2 LIMIT 1",
    [agentId, kbId],
  );
  return row?.collection_name ?? null;
}

// ─── Production resolution (runtime) ──────────────────────────────────────────

/** The immutable production version config for an agent, or null. */
export async function getProductionVersionConfig(agentId: string): Promise<AgentVersion | null> {
  const row = await queryOne<Row>(
    `${VERSION_SELECT}
      JOIN agent_deployments dep ON dep.version_id = v.id
     WHERE v.agent_id = $1 AND dep.status = 'active' AND dep.environment = 'production'`,
    [agentId],
  );
  return row ? toVersion(row) : null;
}

/** Direct (uncached) production lookup used on hot paths via the TTL cache below. */
const PROD_CACHE_TTL_MS = 3_000;
const prodCache = new Map<string, { expiresAt: number; value: AgentVersion | null }>();

export async function getProductionVersionConfigCached(agentId: string): Promise<AgentVersion | null> {
  const hit = prodCache.get(agentId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await getProductionVersionConfig(agentId);
  prodCache.set(agentId, { expiresAt: Date.now() + PROD_CACHE_TTL_MS, value });
  if (prodCache.size > 1024) {
    const now = Date.now();
    for (const [k, entry] of prodCache) {
      if (entry.expiresAt <= now) prodCache.delete(k);
    }
  }
  return value;
}

const deploymentCache = new Map<string, { expiresAt: number; value: AgentDeployment | null }>();

/** TTL-cached active production deployment (publish invalidates it). */
export async function getActiveDeploymentCached(agentId: string): Promise<AgentDeployment | null> {
  const hit = deploymentCache.get(agentId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await getActiveDeployment(agentId);
  deploymentCache.set(agentId, { expiresAt: Date.now() + PROD_CACHE_TTL_MS, value });
  if (deploymentCache.size > 1024) {
    const now = Date.now();
    for (const [k, entry] of deploymentCache) {
      if (entry.expiresAt <= now) deploymentCache.delete(k);
    }
  }
  return value;
}

export function invalidateProductionVersionCache(): void {
  prodCache.clear();
  deploymentCache.clear();
}
