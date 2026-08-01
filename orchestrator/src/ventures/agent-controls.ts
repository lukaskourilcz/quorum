import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { FoundingAgentSchema, type FoundingAgent } from "../types.js";
import { configRoot } from "../paths.js";

const VentureIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const VentureControlSchema = z.object({
  lockedOn: z.array(FoundingAgentSchema),
  switchable: z.array(FoundingAgentSchema),
  disabled: z.array(FoundingAgentSchema)
}).superRefine((value, context) => {
  const locked = new Set(value.lockedOn);
  const switchable = new Set(value.switchable);
  if (locked.size !== value.lockedOn.length || switchable.size !== value.switchable.length) {
    context.addIssue({ code: "custom", message: "Agent control lists cannot contain duplicates" });
  }
  for (const agent of value.disabled) {
    if (!switchable.has(agent)) {
      context.addIssue({ code: "custom", message: `${agent} is disabled but is not switchable` });
    }
  }
  for (const agent of locked) {
    if (switchable.has(agent)) {
      context.addIssue({ code: "custom", message: `${agent} cannot be both locked on and switchable` });
    }
  }
});

export const VentureAgentControlsSchema = z.object({
  schemaVersion: z.literal(1),
  ventures: z.record(VentureIdSchema, VentureControlSchema)
});

export type VentureAgentControls = z.infer<typeof VentureAgentControlsSchema>;

export async function loadVentureAgentControls(
  filePath = path.join(configRoot, "venture-agent-controls.json")
): Promise<VentureAgentControls> {
  return VentureAgentControlsSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

export function disabledAgentsForVenture(
  controls: VentureAgentControls,
  ventureId: string
): Set<FoundingAgent> {
  return new Set(controls.ventures[ventureId]?.disabled ?? []);
}

export function enabledAgentsForVenture(
  controls: VentureAgentControls,
  ventureId: string,
  agents: readonly FoundingAgent[]
): FoundingAgent[] {
  const disabled = disabledAgentsForVenture(controls, ventureId);
  return agents.filter((agent) => !disabled.has(agent));
}

export function caughtUpSocialProductionEnabled(controls: VentureAgentControls): boolean {
  const disabled = disabledAgentsForVenture(controls, "caught-up");
  return !disabled.has("THREADS") && !disabled.has("INSTAGRAM") && !disabled.has("FRAME");
}
