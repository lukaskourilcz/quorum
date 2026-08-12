import { z, type ZodType } from "zod";
import { AudienceSpecSchema } from "./audience-spec.js";
import { ActionPacketSchema } from "./action-packet.js";
import { BoardlessDatasetSchema } from "./boardless-dataset.js";
import { BoardlessStreamSchema, StreamSyncReceiptSchema } from "./boardless-stream.js";
import { BoardlessEventsSchema } from "./boardless-events.js";
import { BhCycleSchema } from "./bh-cycle.js";
import { BhSeedLibrarySchema } from "./bh-seed.js";
import { BhShortlistSchema } from "./bh-shortlist.js";
import { TehdejsiFactsFileSchema } from "./tehdejsi-facts.js";
import { TehdejsiCycleSchema } from "./tehdejsi-cycle.js";
import { TehdejsiShortlistSchema } from "./tehdejsi-shortlist.js";
import { BhResearchBriefBundleSchema } from "./bh-research-brief.js";
import { BhDossierSchema, BhResearchLedgerEntrySchema } from "./bh-dossier.js";
import { CalendarFeedSchema } from "./calendar.js";
import { BookKbIndexSchema } from "./book-kb-index.js";
import { CampaignBriefSchema } from "./campaign-brief.js";
import { CarouselTemplateSchema } from "./carousel-template.js";
import { DailyDigestSchema } from "./daily-digest.js";
import { DesignProposalSchema } from "./design-proposal.js";
import { DoorMoneyPlaybookSchema } from "./door-money-playbook.js";
import { EditionPackageSchema } from "./edition-package.js";
import { HookAssignmentSchema } from "./hook-assignment.js";
import { IdeaLedgerEntrySchema } from "./idea-ledger.js";
import { KpiSetSchema } from "./kpi-set.js";
import { MarketingPlanSchema } from "./marketing-plan.js";
import { MeetingEmailSchema } from "./meeting-email.js";
import { MeetingAgendaQueueSchema } from "./meeting-agenda.js";
import { MeetingRecordSchema } from "./meeting-record.js";
import { OpsReportSchema } from "./ops-report.js";
import { OwnerAttentionSchema } from "./owner-attention.js";
import { AnyOwnerResultEntrySchema } from "./owner-result-entry.js";
import { AnyPerformanceWeightsSchema, BooksofHistoryPerformanceWeightProposalSchema } from "./performance-weights.js";
import {
  AdjustmentEntrySchema,
  BoutRecordSchema,
  BetTypeCatalogSchema,
  EdgeReportSchema,
  EventCardSchema,
  FighterRecordSchema,
  FightAiQStatsEntrySchema,
  ModelRunSchema,
  OddsSnapshotSchema,
  SlipOfTenSchema,
  SourceProposalSchema,
  TrackRecordSchema
} from "./mma.js";
import { ArticlePackageSchema, EditorialSlateSchema, SocialVariantPackSchema } from "./mma-files.js";
import { RatingRecordSchema } from "./rating.js";
import { SeasonFileSchema } from "./season.js";
import { SocialPackSchema } from "./social-pack.js";
import { StyleProfileSchema } from "./style-profile.js";
import { VentureRegistrySchema } from "./venture-registry.js";
import { AnyVentureRecommendationSchema } from "./venture-recommendation.js";
import { VisualWeightsSchema } from "./visual-weights.js";
import {
  ArticleImageSchema,
  MetricsPlaceholderSchema,
  PriorityItemSchema,
  PriorityQueueSchema,
  ReleaseProofSchema,
  SocialActivationSchema,
  SocialPostReceiptSchema
} from "./autonomy.js";

export const ContractSchemas = {
  "action-packet": ActionPacketSchema,
  "audience-spec": AudienceSpecSchema,
  "boardless-dataset": BoardlessDatasetSchema,
  "boardless-stream": BoardlessStreamSchema,
  "boardless-events": BoardlessEventsSchema,
  "bh-cycle": BhCycleSchema,
  "bh-seed": BhSeedLibrarySchema,
  "bh-shortlist": BhShortlistSchema,
  "tehdejsi-facts": TehdejsiFactsFileSchema,
  "tehdejsi-cycle": TehdejsiCycleSchema,
  "tehdejsi-shortlist": TehdejsiShortlistSchema,
  "bh-research-brief": BhResearchBriefBundleSchema,
  "bh-dossier": BhDossierSchema,
  "bh-research-ledger": BhResearchLedgerEntrySchema,
  "book-kb-index": BookKbIndexSchema,
  "stream-sync": StreamSyncReceiptSchema,
  "calendar": CalendarFeedSchema,
  "campaign-brief": CampaignBriefSchema,
  "carousel-template": CarouselTemplateSchema,
  "daily-digest": DailyDigestSchema,
  "design-proposal": DesignProposalSchema,
  "door-money-playbook": DoorMoneyPlaybookSchema,
  "edition-package": EditionPackageSchema,
  "hook-assignment": HookAssignmentSchema,
  "idea-ledger": IdeaLedgerEntrySchema,
  "kpi-set": KpiSetSchema,
  "marketing-plan": MarketingPlanSchema,
  "meeting-email": MeetingEmailSchema,
  "meeting-agenda": MeetingAgendaQueueSchema,
  "meeting-record": MeetingRecordSchema,
  "ops-report": OpsReportSchema,
  "owner-attention": OwnerAttentionSchema,
  "owner-result-entry": AnyOwnerResultEntrySchema,
  "performance-weights": AnyPerformanceWeightsSchema,
  "performance-weight-proposal": BooksofHistoryPerformanceWeightProposalSchema,
  "adjustment-entry": AdjustmentEntrySchema,
  "bet-type-catalog": BetTypeCatalogSchema,
  "bout-record": BoutRecordSchema,
  "edge-report": EdgeReportSchema,
  "event-card": EventCardSchema,
  "fighter-record": FighterRecordSchema,
  "fightaiq-stats": FightAiQStatsEntrySchema,
  "model-run": ModelRunSchema,
  "odds-snapshot": OddsSnapshotSchema,
  "slip-of-ten": SlipOfTenSchema,
  "source-proposal": SourceProposalSchema,
  "track-record": TrackRecordSchema,
  "article": ArticlePackageSchema,
  "social-variant": SocialVariantPackSchema,
  "editorial-slate": EditorialSlateSchema,
  "rating": RatingRecordSchema,
  "season": SeasonFileSchema,
  "social-pack": SocialPackSchema,
  "style-profile": StyleProfileSchema,
  "venture-registry": VentureRegistrySchema,
  "venture-recommendation": AnyVentureRecommendationSchema,
  "visual-weights": VisualWeightsSchema,
  "article-image": ArticleImageSchema,
  "metrics-placeholder": MetricsPlaceholderSchema,
  "priority-item": PriorityItemSchema,
  "priority-queue": PriorityQueueSchema,
  "release-proof": ReleaseProofSchema,
  "social-activation": SocialActivationSchema,
  "social-post-receipt": SocialPostReceiptSchema
} satisfies Record<string, ZodType>;

export type ContractName = keyof typeof ContractSchemas;

export function jsonSchemaText(name: ContractName): string {
  const schema = z.toJSONSchema(ContractSchemas[name], {
    target: "draft-2020-12",
    unrepresentable: "any"
  });
  return `${JSON.stringify({ ...schema, $id: `https://boardless.ai/contracts/${name}.schema.json` }, null, 2)}\n`;
}
