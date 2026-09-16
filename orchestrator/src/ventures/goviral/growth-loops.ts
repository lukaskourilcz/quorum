import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { configRoot as defaultConfigRoot } from "../../paths.js";

/**
 * One growth loop per venture, and the arithmetic for how much of it a play turns.
 *
 * A loop is not a list of tactics. It is a closed cycle whose last stage feeds the first, which
 * is the whole difference between a loop and a funnel: a funnel needs fresh fuel poured in at the
 * top every time, a loop reinvests its own output. `stages[n].feedsStageId` is what makes that
 * checkable rather than aspirational, and `assertClosed` is why a half-drawn loop cannot be
 * committed.
 *
 * Two rules keep the file honest:
 *
 * - **A stage that cannot run says so.** `blocked` names the exact missing account, credential,
 *   provider or approved scope and points at the owner action that would unblock it. It never
 *   becomes a plan to spend, because nothing here may spend.
 * - **Loop fit is measured over live stages only.** A play that feeds a blocked stage gets a note
 *   and no credit, so a loop whose middle is missing cannot flatter the plays aimed at it.
 *
 * Nothing in this module reads a clock, opens a socket, calls a model or costs a cent.
 */

export const LoopKindSchema = z.enum(["content-to-audience", "free-tool-to-product", "research-to-backlinks", "efficiency"]);
export const StageStatusSchema = z.enum(["live", "blocked", "held"]);

const IdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80);

const StageSchema = z.strictObject({
  id: IdSchema,
  label: z.string().trim().min(1).max(160),
  /** A platform id from the priors, or one of the non-social surfaces a loop legitimately runs on. */
  surface: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(40),
  output: z.string().trim().min(1).max(400),
  feedsStageId: IdSchema,
  status: StageStatusSchema,
  blockedBy: z.string().trim().max(600).optional(),
  ownerAction: z.string().trim().max(200).optional()
}).superRefine((stage, context) => {
  if (stage.status !== "live" && !stage.blockedBy) {
    context.addIssue({ code: "custom", path: ["blockedBy"], message: "a stage that does not run must name what is missing" });
  }
  if (stage.status === "live" && stage.blockedBy) {
    context.addIssue({ code: "custom", path: ["blockedBy"], message: "a live stage cannot also be blocked" });
  }
});

const LoopSchema = z.strictObject({
  ventureId: IdSchema,
  id: IdSchema,
  name: z.string().trim().min(1).max(160),
  kind: LoopKindSchema,
  input: z.string().trim().min(1).max(400),
  $kindComment: z.string().optional(),
  $ventureStatusComment: z.string().optional(),
  stages: z.array(StageSchema).min(2).max(8)
}).superRefine((loop, context) => {
  const ids = loop.stages.map((stage) => stage.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["stages"], message: "a stage id appears twice" });
  }
  for (const [index, stage] of loop.stages.entries()) {
    if (!ids.includes(stage.feedsStageId)) {
      context.addIssue({ code: "custom", path: ["stages", index, "feedsStageId"], message: `feeds a stage that does not exist: ${stage.feedsStageId}` });
    }
  }
  // Walking the chain is what separates a loop from a line. Three stages where the third feeds
  // the second parse fine field by field and are not a loop.
  const visited = new Set<string>();
  let cursor = loop.stages[0]?.id;
  while (cursor !== undefined && !visited.has(cursor)) {
    visited.add(cursor);
    cursor = loop.stages.find((stage) => stage.id === cursor)?.feedsStageId;
  }
  if (cursor !== loop.stages[0]?.id || visited.size !== loop.stages.length) {
    context.addIssue({ code: "custom", path: ["stages"], message: "the stages must form one closed cycle that visits every stage" });
  }
});

export const GoViralGrowthLoopsSchema = z.strictObject({
  schemaVersion: z.literal("goviral-growth-loops/1"),
  loopsVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  $comment: z.string().optional(),
  $sourceComment: z.string().optional(),
  $costComment: z.string().optional(),
  $unrecordedComment: z.string().optional(),
  loops: z.array(LoopSchema).min(1).max(30),
  unrecordedVentures: z.array(z.strictObject({
    ventureId: IdSchema,
    reason: z.string().trim().min(1).max(600)
  })).max(30)
}).superRefine((registry, context) => {
  const owners = registry.loops.map((loop) => loop.ventureId);
  if (new Set(owners).size !== owners.length) {
    context.addIssue({ code: "custom", path: ["loops"], message: "a venture gets one loop" });
  }
  for (const [index, entry] of registry.unrecordedVentures.entries()) {
    if (owners.includes(entry.ventureId)) {
      context.addIssue({ code: "custom", path: ["unrecordedVentures", index], message: `${entry.ventureId} has a loop and cannot also be unrecorded` });
    }
  }
});

export type GoViralGrowthLoops = z.infer<typeof GoViralGrowthLoopsSchema>;
export type GrowthLoop = z.infer<typeof LoopSchema>;
export type GrowthLoopStage = z.infer<typeof StageSchema>;

export async function loadGoViralGrowthLoops(configRoot = defaultConfigRoot): Promise<GoViralGrowthLoops> {
  return GoViralGrowthLoopsSchema.parse(
    JSON.parse(await readFile(path.join(configRoot, "goviral-growth-loops.json"), "utf8"))
  );
}

export function growthLoopFor(registry: GoViralGrowthLoops, ventureId: string): GrowthLoop | null {
  return registry.loops.find((loop) => loop.ventureId === ventureId) ?? null;
}

export interface LoopContribution {
  /** How much of the turning part of the loop the play touches, on 0-1. `null` when none of it turns. */
  fit: number | null;
  liveStages: number;
  touchedStages: readonly string[];
  /** Stages the play aims at that cannot run, so the owner sees the plan is aimed at a wall. */
  blockedStages: readonly string[];
  unknownStages: readonly string[];
  /** Whether the play reaches the stage that feeds the loop's first stage — the one that closes it. */
  closesLoop: boolean;
}

/**
 * How much of its venture's loop a play turns.
 *
 * Measured over live stages only. A loop whose middle is blocked has fewer turning stages, so a
 * play that touches one of the survivors scores higher against it than the same play would
 * against a whole loop — which is correct: when three of four stages are dark, the one that still
 * moves is most of what there is. The blocked stages come back named so the brief can say the
 * play is aimed at something that does not run.
 */
export function loopContribution(loop: GrowthLoop, stageIds: readonly string[]): LoopContribution {
  const declared = [...new Set(stageIds)];
  const known = new Map(loop.stages.map((stage) => [stage.id, stage] as const));
  const touched = declared.filter((id) => known.get(id)?.status === "live");
  const blocked = declared.filter((id) => {
    const status = known.get(id)?.status;
    return status === "blocked" || status === "held";
  });
  const unknown = declared.filter((id) => !known.has(id));
  const liveStages = loop.stages.filter((stage) => stage.status === "live").length;
  const first = loop.stages[0];
  const closingStageId = first ? loop.stages.find((stage) => stage.feedsStageId === first.id)?.id : undefined;
  return {
    fit: liveStages === 0 ? null : touched.length / liveStages,
    liveStages,
    touchedStages: touched,
    blockedStages: blocked,
    unknownStages: unknown,
    closesLoop: closingStageId !== undefined && touched.includes(closingStageId)
  };
}

/**
 * The loops as one deterministic block.
 *
 * `packet` is one line per loop, because the gv-brief packet is capped at eighteen thousand
 * characters it shares with the scout snapshot and the owner profile, and the room needs the shape
 * of the loop rather than every sentence about it. What survives the compression is the stage
 * chain and the blocked stages: a room told only about the working parts of a loop keeps
 * proposing plays for the parts that are dark.
 */
export function renderGrowthLoopsBrief(
  registry: GoViralGrowthLoops,
  options: { detail?: "packet" | "full" } = {}
): string {
  const full = options.detail === "full";
  const loops = registry.loops.map((loop) => {
    if (full) {
      const stages = loop.stages
        .map((stage) => {
          const blocked = stage.status === "live" ? "" : ` [${stage.status}: ${stage.blockedBy ?? "reason not recorded"}]`;
          return `  ${stage.id} (${stage.surface}) → ${stage.feedsStageId}: ${stage.label}. ${stage.output}${blocked}`;
        })
        .join("\n");
      return `- ${loop.ventureId} — ${loop.name} (${loop.kind}). Input: ${loop.input}\n${stages}`;
    }
    const chain = loop.stages
      .map((stage) => `${stage.id}${stage.status === "live" ? "" : `[${stage.status}]`}(${stage.surface})`)
      .join(" → ");
    // The reason is capped rather than dropped. A packet that says a stage is blocked without
    // saying why sends the room back to propose the same play next Monday.
    const stopped = loop.stages
      .filter((stage) => stage.status !== "live")
      .map((stage) => `${stage.id}: ${(stage.blockedBy ?? "reason not recorded").slice(0, 160)}`)
      .join(" ");
    return `- ${loop.ventureId} — ${loop.name} (${loop.kind}): ${chain} → ${loop.stages[0]?.id ?? ""}.${stopped ? ` Stopped — ${stopped}` : ""}`;
  }).join("\n");
  const unrecorded = full
    ? registry.unrecordedVentures.map((entry) => `- ${entry.ventureId}: ${entry.reason}`).join("\n")
    : `${registry.unrecordedVentures.map((entry) => entry.ventureId).join(", ")} — reasons in config/goviral-growth-loops.json.`;
  return [
    `Growth loops, verified ${registry.verifiedAt}. Rate a play by how much of its venture's loop it turns; a play that turns none of it is a tactic, and a tactic is worth proposing only when it is cheap and says so.`,
    loops,
    "Ventures with no loop, and why:",
    unrecorded
  ].join("\n\n");
}
