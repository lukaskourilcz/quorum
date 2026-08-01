import { z, type ZodType } from "zod";
import { AudienceSpecSchema } from "./audience-spec.js";
import { CalendarFeedSchema } from "./calendar.js";
import { CampaignBriefSchema } from "./campaign-brief.js";
import { DailyDigestSchema } from "./daily-digest.js";
import { EditionPackageSchema } from "./edition-package.js";
import { IdeaLedgerEntrySchema } from "./idea-ledger.js";
import { MarketingPlanSchema } from "./marketing-plan.js";
import { MeetingEmailSchema } from "./meeting-email.js";
import { MeetingRecordSchema } from "./meeting-record.js";
import {
  AdjustmentEntrySchema,
  BetTypeCatalogSchema,
  EdgeReportSchema,
  EventCardSchema,
  FighterRecordSchema,
  ModelRunSchema,
  OddsSnapshotSchema,
  SlipOfTenSchema,
  SourceProposalSchema,
  TrackRecordSchema
} from "./mma.js";
import { NicheProposalSchema } from "./niche-proposal.js";
import { RatingRecordSchema } from "./rating.js";
import { SeasonFileSchema } from "./season.js";
import { SocialPackSchema } from "./social-pack.js";
import { VentureRegistrySchema } from "./venture-registry.js";
import { VisualWeightsSchema } from "./visual-weights.js";

export const ContractSchemas = {
  "audience-spec": AudienceSpecSchema,
  "calendar": CalendarFeedSchema,
  "campaign-brief": CampaignBriefSchema,
  "daily-digest": DailyDigestSchema,
  "edition-package": EditionPackageSchema,
  "idea-ledger": IdeaLedgerEntrySchema,
  "marketing-plan": MarketingPlanSchema,
  "meeting-email": MeetingEmailSchema,
  "meeting-record": MeetingRecordSchema,
  "adjustment-entry": AdjustmentEntrySchema,
  "bet-type-catalog": BetTypeCatalogSchema,
  "edge-report": EdgeReportSchema,
  "event-card": EventCardSchema,
  "fighter-record": FighterRecordSchema,
  "model-run": ModelRunSchema,
  "odds-snapshot": OddsSnapshotSchema,
  "slip-of-ten": SlipOfTenSchema,
  "source-proposal": SourceProposalSchema,
  "track-record": TrackRecordSchema,
  "niche-proposal": NicheProposalSchema,
  "rating": RatingRecordSchema,
  "season": SeasonFileSchema,
  "social-pack": SocialPackSchema,
  "venture-registry": VentureRegistrySchema,
  "visual-weights": VisualWeightsSchema
} satisfies Record<string, ZodType>;

export type ContractName = keyof typeof ContractSchemas;

export function jsonSchemaText(name: ContractName): string {
  const schema = z.toJSONSchema(ContractSchemas[name], {
    target: "draft-2020-12",
    unrepresentable: "any"
  });
  return `${JSON.stringify({ ...schema, $id: `https://boardless.ai/contracts/${name}.schema.json` }, null, 2)}\n`;
}
