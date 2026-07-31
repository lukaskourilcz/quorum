import { z } from "zod";
import { AudienceCoreSchema } from "./audience-spec.js";
import { EvidenceRefSchema, MeetingRefSchema, openObject } from "./common.js";

const QuantitativeClaimPattern = /(?:\d|%|\$|€|£)/;

export const NicheProposalSchema = openObject({
  schemaVersion: z.literal("niche-proposal/1"),
  id: z.string().regex(/^niche-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}$/),
  domain: z.string().trim().min(1).max(120),
  oneLiner: z.string().trim().min(1).max(240),
  whyPeopleCareDaily: z.string().trim().min(1).max(800),
  audienceHypothesis: AudienceCoreSchema,
  contentShape: openObject({
    cadence: z.string().trim().min(1).max(120),
    formats: z.array(z.string().trim().min(1).max(80)).min(1),
    caughtUpReuseNotes: z.string().trim().min(1).max(500)
  }),
  competitionNotes: z.array(openObject({
    note: z.string().trim().min(1).max(500),
    evidenceRef: EvidenceRefSchema
  })),
  risks: z.array(z.string().trim().min(1).max(300)),
  evidenceRefs: z.array(EvidenceRefSchema),
  status: z.enum(["proposed", "rated", "shortlist", "archived"]),
  originMeetingRef: MeetingRefSchema
}).superRefine((proposal, context) => {
  const claimText = [
    proposal.domain,
    proposal.oneLiner,
    proposal.whyPeopleCareDaily,
    proposal.contentShape.cadence,
    proposal.contentShape.caughtUpReuseNotes,
    ...proposal.competitionNotes.map(({ note }) => note),
    ...proposal.risks
  ].join(" ");

  if (QuantitativeClaimPattern.test(claimText) && proposal.evidenceRefs.length === 0) {
    context.addIssue({
      code: "custom",
      message: "Quantitative claims require an evidenceRef",
      path: ["evidenceRefs"]
    });
  }
});

export type NicheProposal = z.infer<typeof NicheProposalSchema>;
