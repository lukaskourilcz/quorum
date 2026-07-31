import { z } from "zod";
import { DateTimeSchema, VentureIdSchema, openObject } from "./common.js";

const WeightSchema = z.number().finite().min(0.1).max(1);

export const VisualWeightsSchema = openObject({
  schemaVersion: z.literal("visual-weights/1"),
  ventureId: VentureIdSchema,
  updatedAt: DateTimeSchema,
  weights: z.record(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), WeightSchema),
  adjustments: z.array(openObject({
    template: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    from: WeightSchema,
    to: WeightSchema,
    ratingIds: z.array(z.string().regex(/^r-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}$/)).min(1),
    adjustedAt: DateTimeSchema
  }))
});

export type VisualWeights = z.infer<typeof VisualWeightsSchema>;
