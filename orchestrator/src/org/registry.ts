import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { configRoot } from "../paths.js";

export const FOUNDING_AGENT_IDS = [
  "VIZE",
  "FORGE",
  "PULSE",
  "AUDIT",
  "SCOUT",
  "SCRIBE",
  "LENS",
  "QUILL",
  "RADAR",
  "KEEPER",
  "THREADS",
  "INSTAGRAM",
  "PEOPLE",
  "LEDGER"
] as const;

const FoundingAgentIdSchema = z.enum(FOUNDING_AGENT_IDS);

const AgentVisualSchema = z.object({
  motif: z.string().min(3).max(80),
  accentToken: z.string().regex(/^agent-[a-z0-9-]+$/),
  avatar: z.string().regex(/^\/agents\/[a-z0-9-]+\.webp$/),
  avatarAlt: z
    .string()
    .min(20)
    .max(180)
    .refine((value) => value.toLowerCase().includes("non-human"), {
      message: "avatarAlt must disclose the non-human identity"
    }),
  provenanceRef: z.string().regex(/^AVATAR-[A-Z0-9-]+$/)
});

const AgentSchema = z.object({
  id: FoundingAgentIdSchema,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(["council", "specialist"]),
  provider: z.enum(["OpenAI", "Anthropic", "deterministic"]),
  department: z.string().min(2).max(60),
  title: z.string().min(4).max(80),
  mission: z.string().min(20).max(220),
  responsibilities: z.array(z.string().min(3).max(100)).min(2).max(4),
  notResponsibleFor: z.array(z.string().min(3).max(120)).min(1).max(4),
  decisionRights: z.array(z.string().min(3).max(120)).min(1).max(4),
  ownedKpiIds: z.array(z.string().regex(/^[a-z]+\.[a-z0-9_]+$/)),
  successChecks: z.array(z.string().min(8).max(160)).min(1).max(5),
  capabilityTags: z.array(z.string().regex(/^[a-z0-9_:]+$/)).min(1),
  status: z.enum([
    "active",
    "coaching",
    "restricted",
    "paused",
    "proposed",
    "retired"
  ]),
  activatedAt: z.iso.date(),
  profileVersion: z.number().int().positive(),
  lastOrgReviewAt: z.iso.date().nullable(),
  descriptionRef: z.string().regex(/^agent-profile:[A-Z0-9-]+:v\d+$/),
  skillRefs: z.array(z.string().regex(/^\.claude\/skills\/[a-z0-9-]+\/SKILL\.md$/)),
  visual: AgentVisualSchema
});

export const AgentRegistrySchema = z
  .object({
    schemaVersion: z.literal(1),
    agents: z.array(AgentSchema)
  })
  .superRefine((registry, context) => {
    const ids = registry.agents.map((agent) => agent.id);
    const slugs = registry.agents.map((agent) => agent.slug);
    const avatars = registry.agents.map((agent) => agent.visual.avatar);
    const expected = new Set<string>(FOUNDING_AGENT_IDS);

    if (ids.length !== FOUNDING_AGENT_IDS.length || ids.some((id) => !expected.has(id))) {
      context.addIssue({
        code: "custom",
        message: "registry must contain exactly the 14 founding agent IDs",
        path: ["agents"]
      });
    }

    for (const [label, values] of [
      ["id", ids],
      ["slug", slugs],
      ["avatar", avatars]
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          message: `duplicate agent ${label}`,
          path: ["agents"]
        });
      }
    }

    registry.agents.forEach((agent, index) => {
      const expectedSlug = agent.id.toLowerCase();
      if (agent.slug !== expectedSlug) {
        context.addIssue({
          code: "custom",
          message: `slug must be ${expectedSlug}`,
          path: ["agents", index, "slug"]
        });
      }
      if (agent.visual.avatar !== `/agents/${expectedSlug}.webp`) {
        context.addIssue({
          code: "custom",
          message: "avatar path must match the stable agent slug",
          path: ["agents", index, "visual", "avatar"]
        });
      }
      if (agent.visual.provenanceRef !== `AVATAR-${agent.id}`) {
        context.addIssue({
          code: "custom",
          message: "provenanceRef must match the stable agent ID",
          path: ["agents", index, "visual", "provenanceRef"]
        });
      }
      if (agent.kind === "council" && !FOUNDING_AGENT_IDS.slice(0, 4).includes(agent.id)) {
        context.addIssue({
          code: "custom",
          message: "only the four founding voting seats may use kind=council",
          path: ["agents", index, "kind"]
        });
      }
      if (agent.kind === "specialist" && FOUNDING_AGENT_IDS.slice(0, 4).includes(agent.id)) {
        context.addIssue({
          code: "custom",
          message: "the four founding voting seats must use kind=council",
          path: ["agents", index, "kind"]
        });
      }
    });
  });

export type AgentRegistry = z.infer<typeof AgentRegistrySchema>;
export type RegisteredAgent = AgentRegistry["agents"][number];

export async function loadAgentRegistry(
  registryPath = path.join(configRoot, "agents.json")
): Promise<AgentRegistry> {
  const source = await readFile(registryPath, "utf8");
  return AgentRegistrySchema.parse(JSON.parse(source) as unknown);
}
