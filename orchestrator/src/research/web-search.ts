import { z } from "zod";

export const WebSearchReservationSchema = z.object({
  objective: z.string().min(1).max(300),
  query: z.string().min(1).max(300),
  maxCalls: z.number().int().min(1).max(3),
  maxSearchContentTokens: z.number().int().min(1).max(8_000),
  permittedHosts: z.array(z.string().min(1)).max(20),
  evidenceRequired: z.boolean().default(true)
});
export type WebSearchReservation = z.infer<typeof WebSearchReservationSchema>;

export function assertBoundedWebSearch(value: unknown): WebSearchReservation {
  const reservation = WebSearchReservationSchema.parse(value);
  if (reservation.permittedHosts.length === 0) {
    throw new Error("Web search requires an explicit host scope");
  }
  return reservation;
}
