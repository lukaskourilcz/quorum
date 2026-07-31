import { z } from "zod";
import { ContractAgentIdSchema, VentureIdSchema, openObject } from "./common.js";

const VentureMeetingDefinitionSchema = openObject({
  kind: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  cadence: z.string().regex(/^daily@(?:0[5-9]|1\d|2[0-3]):00$/),
  cast: z.array(ContractAgentIdSchema).min(1),
  envelopeUsd: z.number().finite().positive().max(1)
});

const VentureDefinitionSchema = openObject({
  id: VentureIdSchema,
  name: z.string().trim().min(1).max(100),
  status: z.enum(["exploration", "operating", "paused"]),
  taste: z.boolean(),
  ledgerNamespace: VentureIdSchema,
  adminTabs: z.array(z.enum(["ideas", "plans", "visuals", "niche-proposals"])),
  meetings: z.array(VentureMeetingDefinitionSchema),
  pendingApproval: z.string().trim().min(1).max(120).optional()
});

export const VentureRegistrySchema = openObject({
  schemaVersion: z.literal("venture-registry/1"),
  ventures: z.array(VentureDefinitionSchema).min(1)
}).superRefine(({ ventures }, context) => {
  for (const key of ["id", "ledgerNamespace"] as const) {
    const values = ventures.map((venture) => venture[key]);
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `Venture ${key} values must be unique`,
        path: ["ventures"]
      });
    }
  }
  const kinds = ventures.flatMap((venture) => venture.meetings.map(({ kind }) => kind));
  if (new Set(kinds).size !== kinds.length) {
    context.addIssue({
      code: "custom",
      message: "Meeting kinds must be unique across ventures",
      path: ["ventures"]
    });
  }
});

export type VentureRegistry = z.infer<typeof VentureRegistrySchema>;
