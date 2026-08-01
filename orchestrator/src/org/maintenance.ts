import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { repoRoot, stateRoot } from "../paths.js";
import { assertOrgChangeApproved, OrgChangeSchema } from "./change.js";
import { AgentRegistrySchema } from "./registry.js";

const RelativePathSchema = z.string().min(1).refine(
  (value) => !path.isAbsolute(value) && !value.split(/[\\/]/).includes(".."),
  "maintenance paths must stay inside the repository"
);

export const OrgMaintenancePlanSchema = z.object({
  schemaVersion: z.literal(1),
  appliedAt: z.string().datetime(),
  approvalRef: z.string().min(1).max(200),
  kind: z.enum([
    "description",
    "responsibility",
    "routing_tag",
    "prompt",
    "skill",
    "model",
    "status",
    "new_role"
  ]),
  change: OrgChangeSchema,
  current: z.string().min(1).max(1_000),
  proposed: z.string().min(1).max(1_000),
  evidenceRefs: z.array(z.string().min(1).max(200)).min(1),
  evaluationWindowCycles: z.number().int().positive(),
  tests: z.array(z.string().min(1).max(200)).min(1),
  rollbackRef: RelativePathSchema,
  affectedFiles: z.array(RelativePathSchema).min(1),
  postconditions: z.object({
    agentId: z.string().regex(/^[A-Z0-9-]+$/),
    minimumOwnedKpis: z.number().int().positive(),
    requiredCapabilities: z.array(z.string().min(1)).min(1),
    promptPath: RelativePathSchema,
    avatarPath: RelativePathSchema.nullable()
  })
}).superRefine((plan, context) => {
  if (plan.kind === "new_role" && plan.change.tier !== "C") {
    context.addIssue({
      code: "custom",
      message: "new roles require a Tier C organization change",
      path: ["change", "tier"]
    });
  }
  if (plan.change.subjectAgent !== plan.postconditions.agentId) {
    context.addIssue({
      code: "custom",
      message: "subjectAgent must match the postcondition agentId",
      path: ["postconditions", "agentId"]
    });
  }
});

export type OrgMaintenancePlan = z.infer<typeof OrgMaintenancePlanSchema>;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function verifyPlanPostconditions(
  plan: OrgMaintenancePlan,
  root: string
): Promise<void> {
  const [registryRaw, routingRaw, kpisRaw, prompt] = await Promise.all([
    readFile(path.join(root, "config/agents.json"), "utf8"),
    readFile(path.join(root, "config/agent-routing.json"), "utf8"),
    readFile(path.join(root, "config/kpis.json"), "utf8"),
    readFile(path.join(root, plan.postconditions.promptPath), "utf8")
  ]);
  const registry = AgentRegistrySchema.parse(JSON.parse(registryRaw) as unknown);
  const agent = registry.agents.find(
    (candidate) => candidate.id === plan.postconditions.agentId
  );
  if (!agent || agent.status !== "active") {
    throw new Error(`org-maintenance: ${plan.postconditions.agentId} is not active`);
  }
  if (agent.ownedKpiIds.length < plan.postconditions.minimumOwnedKpis) {
    throw new Error("org-maintenance: role does not own the declared KPI floor");
  }
  const routing = JSON.parse(routingRaw) as {
    agents?: Record<string, { capabilities?: string[]; status?: string }>;
  };
  const route = routing.agents?.[plan.postconditions.agentId];
  if (!route || route.status !== "active") {
    throw new Error("org-maintenance: active routing entry is missing");
  }
  for (const capability of plan.postconditions.requiredCapabilities) {
    if (!route.capabilities?.includes(capability)) {
      throw new Error(`org-maintenance: routing capability ${capability} is missing`);
    }
  }
  const kpis = JSON.parse(kpisRaw) as { kpis?: Array<{ owner?: string }> };
  const owned = kpis.kpis?.filter(
    (kpi) => kpi.owner === plan.postconditions.agentId
  ).length ?? 0;
  if (owned < plan.postconditions.minimumOwnedKpis) {
    throw new Error("org-maintenance: KPI configuration is incomplete");
  }
  if (prompt.trim().length < 80) {
    throw new Error("org-maintenance: role prompt is missing or too short");
  }
  if (plan.postconditions.avatarPath) {
    const avatar = await readFile(path.join(root, plan.postconditions.avatarPath));
    if (avatar.byteLength === 0) {
      throw new Error("org-maintenance: role avatar is empty");
    }
  } else if (agent.visual.avatar !== null) {
    throw new Error("org-maintenance: active role avatar is missing from the plan");
  }
  await Promise.all(
    plan.affectedFiles.map((file) => readFile(path.join(root, file)))
  );
  await readFile(path.join(root, plan.rollbackRef));
}

export async function applyOrgMaintenancePlan(input: {
  plan: OrgMaintenancePlan;
  repoRoot?: string;
  stateRoot?: string;
}): Promise<{ applied: boolean; recordHash: string }> {
  const plan = OrgMaintenancePlanSchema.parse(input.plan);
  assertOrgChangeApproved(plan.change);
  const root = input.repoRoot ?? repoRoot;
  const state = input.stateRoot ?? stateRoot;
  await verifyPlanPostconditions(plan, root);

  const logPath = path.join(state, "org/changes.jsonl");
  await mkdir(path.dirname(logPath), { recursive: true });
  let existing = "";
  try {
    existing = await readFile(logPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const records = existing
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { id?: string; changeId?: string; status?: string });
  const duplicate = records.find(
    (record) => (record.id ?? record.changeId) === plan.change.id
  );
  if (duplicate) {
    if (duplicate.status !== "applied") {
      throw new Error("org-maintenance: change ID exists without applied status");
    }
    return { applied: false, recordHash: sha256(JSON.stringify(duplicate)) };
  }

  const record = {
    ...plan.change,
    kind: plan.kind,
    current: plan.current,
    proposed: plan.proposed,
    evidenceRefs: plan.evidenceRefs,
    evaluationWindowCycles: plan.evaluationWindowCycles,
    tests: plan.tests,
    rollbackRef: plan.rollbackRef,
    approvalRef: plan.approvalRef,
    appliedAt: plan.appliedAt,
    status: "applied" as const
  };
  const line = JSON.stringify(record);
  const next = `${existing.trimEnd()}${existing.trim() ? "\n" : ""}${line}\n`;
  await writeFile(logPath, next, "utf8");
  return { applied: true, recordHash: sha256(line) };
}

async function main(): Promise<void> {
  const planFile = process.argv[2];
  if (!planFile) throw new Error("Usage: org:maintain <plan.json>");
  const absolute = path.isAbsolute(planFile)
    ? planFile
    : path.resolve(repoRoot, planFile);
  const plan = OrgMaintenancePlanSchema.parse(
    JSON.parse(await readFile(absolute, "utf8")) as unknown
  );
  const result = await applyOrgMaintenancePlan({ plan });
  console.log(JSON.stringify(result));
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  await main();
}
