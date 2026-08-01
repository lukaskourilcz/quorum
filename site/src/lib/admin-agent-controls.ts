import "server-only";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { agents } from "@/data/agents";
import {
  parseAgentControlDocument,
  validAgentId,
  validVentureId,
  type AdminAgentControl,
  type AgentControlDocument as ControlDocument
} from "./agent-control-model";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const controlPath = "config/venture-agent-controls.json";
export type { AdminAgentControl } from "./agent-control-model";

export interface AdminVentureAgentControls {
  ventureId: string;
  agents: AdminAgentControl[];
}

export class AgentControlPersistenceError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "CONFLICT" | "CORRUPT" | "REMOTE", message: string) {
    super(message);
  }
}

async function readDocument(root = repositoryRoot): Promise<ControlDocument> {
  const parsed = parseAgentControlDocument(JSON.parse(await readFile(path.join(root, controlPath), "utf8")));
  if (!parsed) throw new AgentControlPersistenceError("CORRUPT", "The saved agent switches are malformed.");
  return parsed;
}

export async function readAdminAgentControls(root = repositoryRoot): Promise<AdminVentureAgentControls[]> {
  const document = await readDocument(root);
  const byId = new Map<string, (typeof agents)[number]>(agents.map((agent) => [agent.id, agent]));
  return Object.entries(document.ventures).map(([ventureId, control]) => ({
    ventureId,
    agents: [...control.lockedOn, ...control.switchable].map((id) => {
      const agent = byId.get(id);
      if (!agent) throw new AgentControlPersistenceError("CORRUPT", `Unknown agent ${id} in saved switches.`);
      return {
        id,
        title: agent.title,
        mission: agent.mission,
        provider: agent.provider,
        model: agent.apiModelSummary,
        estimatedCost: agent.apiCostSummary,
        enabled: !control.disabled.includes(id),
        locked: control.lockedOn.includes(id)
      };
    })
  }));
}

function updatedDocument(document: ControlDocument, ventureId: string, agentId: string, enabled: boolean): ControlDocument {
  const venture = document.ventures[ventureId];
  if (!venture || !venture.switchable.includes(agentId)) {
    throw new AgentControlPersistenceError("CONFLICT", "That agent cannot be changed for this project.");
  }
  const disabled = new Set(venture.disabled);
  if (enabled) disabled.delete(agentId);
  else disabled.add(agentId);
  return {
    ...document,
    ventures: {
      ...document.ventures,
      [ventureId]: {
        ...venture,
        disabled: venture.switchable.filter((agent) => disabled.has(agent))
      }
    }
  };
}

async function writeLocal(document: ControlDocument, root = repositoryRoot): Promise<void> {
  const target = path.join(root, controlPath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeGitHub(ventureId: string, agentId: string, enabled: boolean, token: string): Promise<void> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const endpoint = `https://api.github.com/repos/${repository}/contents/${controlPath}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentResponse = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    if (!currentResponse.ok) throw new AgentControlPersistenceError("REMOTE", `GitHub agent-switch read failed with ${currentResponse.status}.`);
    const current = await currentResponse.json() as { content?: string; encoding?: string; sha?: string };
    if (current.encoding !== "base64" || !current.content || !current.sha) throw new AgentControlPersistenceError("REMOTE", "GitHub returned an invalid agent-switch file.");
    const parsed = parseAgentControlDocument(JSON.parse(Buffer.from(current.content.replaceAll("\n", ""), "base64").toString("utf8")));
    if (!parsed) throw new AgentControlPersistenceError("CORRUPT", "The saved agent switches are malformed.");
    const next = updatedDocument(parsed, ventureId, agentId, enabled);
    const updateResponse = await fetch(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `admin: turn ${agentId} ${enabled ? "on" : "off"} for ${ventureId}`,
        content: Buffer.from(`${JSON.stringify(next, null, 2)}\n`, "utf8").toString("base64"),
        branch,
        sha: current.sha
      })
    });
    if (updateResponse.ok) return;
    if (updateResponse.status !== 409) throw new AgentControlPersistenceError("REMOTE", `GitHub agent-switch write failed with ${updateResponse.status}.`);
  }
  throw new AgentControlPersistenceError("CONFLICT", "The agent switches changed during every retry.");
}

export async function updateAgentControl(input: { ventureId: string; agentId: string; enabled: boolean }): Promise<void> {
  if (!validVentureId(input.ventureId) || !validAgentId(input.agentId)) {
    throw new AgentControlPersistenceError("CONFLICT", "Invalid agent-switch request.");
  }
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (token) return writeGitHub(input.ventureId, input.agentId, input.enabled, token);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new AgentControlPersistenceError("UNAVAILABLE", "GitHub writing is not configured for this admin.");
  }
  const document = await readDocument();
  await writeLocal(updatedDocument(document, input.ventureId, input.agentId, input.enabled));
}
