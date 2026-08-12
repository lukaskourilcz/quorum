import { z } from "zod";
import {
  DateSchema,
  DateTimeSchema,
  EvidenceRefSchema,
  HttpsUrlSchema,
  VentureIdSchema
} from "./common.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const Sha1Schema = z.string().regex(/^[a-f0-9]{40}$/);
const NullableDateTimeSchema = DateTimeSchema.nullable();

export const VentureRecommendationStatusSchema = z.enum([
  "draft",
  "approved",
  "posted",
  "archived",
  "rejected"
]);

export const VentureClaimTypeSchema = z.enum([
  "fact-multi",
  "fact-single",
  "commentary"
]);

const MonitorSourceRefSchema = z.strictObject({
  itemRef: Sha1Schema,
  sourceId: SlugSchema,
  sourceName: z.string().trim().min(1).max(120),
  url: HttpsUrlSchema,
  publishedAt: DateTimeSchema,
  excerpt: z.string().trim().min(1).max(600),
  discoveryOnly: z.boolean()
});

const VentureClaimSchema = z.strictObject({
  id: SlugSchema,
  type: VentureClaimTypeSchema,
  text: z.string().trim().min(1).max(1_000),
  refs: z.array(Sha1Schema).min(1).max(20)
});

const StitPostSchema = z.strictObject({
  itemRef: Sha1Schema,
  postUrl: HttpsUrlSchema,
  excerpt: z.string().trim().min(1).max(600),
  engagement: z.strictObject({
    likes: z.number().int().nonnegative().nullable(),
    comments: z.number().int().nonnegative().nullable(),
    shares: z.number().int().nonnegative().nullable()
  })
});

export const MonitorClusterEvidenceSchema = z.strictObject({
  kind: z.literal("monitor-cluster"),
  monitorDate: DateSchema,
  receiptRef: z.string().regex(/^state\/ventures\/kvorum\/monitor\/\d{4}-\d{2}-\d{2}\.json$/u),
  clusterId: Sha1Schema,
  continuationOf: SlugSchema.nullable(),
  sources: z.array(MonitorSourceRefSchema).min(1).max(80),
  claims: z.array(VentureClaimSchema).min(1).max(80),
  stitAttribution: z.strictObject({
    internalOnly: z.literal(true),
    summary: z.string().trim().min(1).max(1_000),
    posts: z.array(StitPostSchema).min(1).max(30)
  }).nullable()
}).superRefine((evidence, context) => {
  if (evidence.receiptRef !== `state/ventures/kvorum/monitor/${evidence.monitorDate}.json`) {
    context.addIssue({ code: "custom", message: "Monitor receipt ref must match monitorDate", path: ["receiptRef"] });
  }
  const sources = new Map<string, (typeof evidence.sources)[number]>();
  for (const [index, source] of evidence.sources.entries()) {
    if (sources.has(source.itemRef)) {
      context.addIssue({ code: "custom", message: "Monitor source item refs must be unique", path: ["sources", index, "itemRef"] });
    }
    sources.set(source.itemRef, source);
  }
  const claimIds = new Set<string>();
  for (const [claimIndex, claim] of evidence.claims.entries()) {
    if (claimIds.has(claim.id)) {
      context.addIssue({ code: "custom", message: "Claim ids must be unique", path: ["claims", claimIndex, "id"] });
    }
    claimIds.add(claim.id);
    if (new Set(claim.refs).size !== claim.refs.length) {
      context.addIssue({ code: "custom", message: "Claim refs must be unique", path: ["claims", claimIndex, "refs"] });
    }
    if (claim.type === "fact-multi" && claim.refs.length < 2) {
      context.addIssue({ code: "custom", message: "fact-multi requires at least two refs", path: ["claims", claimIndex, "refs"] });
    }
    for (const [refIndex, ref] of claim.refs.entries()) {
      const source = sources.get(ref);
      if (!source) {
        context.addIssue({ code: "custom", message: "Every claim ref must resolve inside the monitor cluster", path: ["claims", claimIndex, "refs", refIndex] });
      } else if (claim.type !== "commentary" && (
        source.discoveryOnly || source.sourceId === "stit-demokracie-facebook"
      )) {
        context.addIssue({ code: "custom", message: "Discovery-only sources cannot support factual claims", path: ["claims", claimIndex, "refs", refIndex] });
      }
    }
  }
  const discoverySources = evidence.sources.filter((source) =>
    source.discoveryOnly || source.sourceId === "stit-demokracie-facebook"
  );
  const posts = evidence.stitAttribution?.posts ?? [];
  if (new Set(posts.map((post) => post.itemRef)).size !== posts.length) {
    context.addIssue({ code: "custom", message: "Štít post item refs must be unique", path: ["stitAttribution", "posts"] });
  }
  if (discoverySources.length !== posts.length) {
    context.addIssue({ code: "custom", message: "Every discovery-only source requires one internal Štít attribution", path: ["stitAttribution"] });
  }
  const postsByRef = new Map(posts.map((post) => [post.itemRef, post]));
  for (const [index, source] of discoverySources.entries()) {
    const post = postsByRef.get(source.itemRef);
    if (!post || post.postUrl !== source.url || post.excerpt !== source.excerpt) {
      context.addIssue({ code: "custom", message: "Štít attribution must match its cluster source", path: ["sources", index, "itemRef"] });
    }
  }
});

export const VentureRecommendationEvidenceSchema = z.discriminatedUnion("kind", [
  MonitorClusterEvidenceSchema
]);

const CopyBlockSchema = z.strictObject({
  id: SlugSchema,
  platform: SlugSchema,
  format: SlugSchema,
  locale: z.enum(["cs", "en", "uk"]),
  text: z.string().trim().min(1).max(12_000),
  altText: z.string().trim().min(1).max(2_000).nullable(),
  reason: z.string().trim().min(1).max(800)
});

const GateResultsSchema = z.strictObject({
  evaluatedAt: DateTimeSchema,
  passed: z.boolean(),
  results: z.array(z.strictObject({
    gate: SlugSchema,
    verdict: z.enum(["pass", "fail"]),
    message: z.string().trim().min(1).max(800),
    claimIds: z.array(SlugSchema).max(80)
  })).min(1).max(40)
}).superRefine((gates, context) => {
  const ids = new Set<string>();
  for (const [index, result] of gates.results.entries()) {
    if (ids.has(result.gate)) {
      context.addIssue({ code: "custom", message: "Gate ids must be unique", path: ["results", index, "gate"] });
    }
    ids.add(result.gate);
    if (new Set(result.claimIds).size !== result.claimIds.length) {
      context.addIssue({ code: "custom", message: "Gate claim ids must be unique", path: ["results", index, "claimIds"] });
    }
  }
  if (gates.passed !== gates.results.every((result) => result.verdict === "pass")) {
    context.addIssue({ code: "custom", message: "passed must summarize every gate verdict", path: ["passed"] });
  }
});

const DesignLabSchema = z.strictObject({
  status: z.enum(["not-requested", "queued", "rendered", "failed"]),
  requestedAt: NullableDateTimeSchema,
  resolvedAt: NullableDateTimeSchema,
  recipeRef: EvidenceRefSchema.nullable(),
  artifactRefs: z.array(EvidenceRefSchema).max(20),
  failureReason: z.string().trim().min(1).max(800).nullable()
}).superRefine((design, context) => {
  const empty = design.requestedAt === null
    && design.resolvedAt === null
    && design.recipeRef === null
    && design.artifactRefs.length === 0
    && design.failureReason === null;
  if (design.status === "not-requested" && !empty) {
    context.addIssue({ code: "custom", message: "A not-requested design cannot claim work", path: ["status"] });
  }
  if (design.status !== "not-requested" && design.requestedAt === null) {
    context.addIssue({ code: "custom", message: "Design work requires requestedAt", path: ["requestedAt"] });
  }
  if (design.status === "rendered" && (
    design.resolvedAt === null || design.recipeRef === null || design.artifactRefs.length === 0
  )) {
    context.addIssue({ code: "custom", message: "Rendered design requires its recipe, artifacts and resolvedAt", path: ["status"] });
  }
  if (design.status === "failed" && (design.resolvedAt === null || design.failureReason === null)) {
    context.addIssue({ code: "custom", message: "Failed design requires a recorded reason and resolvedAt", path: ["failureReason"] });
  }
  if (design.status !== "failed" && design.failureReason !== null) {
    context.addIssue({ code: "custom", message: "Only failed design work carries a failure reason", path: ["failureReason"] });
  }
});

const OwnerFieldsSchema = z.strictObject({
  postingMode: z.literal("manual-only"),
  approvedAt: NullableDateTimeSchema,
  postedAt: NullableDateTimeSchema,
  archivedAt: NullableDateTimeSchema,
  rejectedAt: NullableDateTimeSchema,
  rejectionReason: z.string().trim().min(1).max(800).nullable(),
  postedUrl: HttpsUrlSchema.nullable(),
  resultRefs: z.array(EvidenceRefSchema).max(40),
  ratingRef: EvidenceRefSchema.nullable(),
  editHistory: z.array(z.strictObject({
    editedAt: DateTimeSchema,
    changedBy: z.literal("owner"),
    fields: z.array(z.enum([
      "headline",
      "summary",
      "whyItMatters",
      "whyThisIsWorthIt",
      "ourAngle",
      "ourAngleDiffers",
      "platforms",
      "formats",
      "copyBlocks"
    ])).min(1).max(8),
    note: z.string().trim().min(1).max(800)
  })).max(100)
});

export const VentureRecommendationSchema = z.strictObject({
  schemaVersion: z.literal("venture-recommendation/1"),
  id: SlugSchema,
  ventureId: VentureIdSchema,
  date: DateSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  status: VentureRecommendationStatusSchema,
  headline: z.string().trim().min(1).max(240),
  summary: z.string().trim().min(1).max(2_000),
  whyItMatters: z.string().trim().min(1).max(2_000),
  whyThisIsWorthIt: z.string().trim().min(1).max(1_000),
  ourAngle: z.string().trim().min(1).max(2_000),
  ourAngleDiffers: z.string().trim().min(1).max(2_000),
  platforms: z.array(SlugSchema).min(1).max(10),
  formats: z.array(SlugSchema).min(1).max(20),
  copyBlocks: z.array(CopyBlockSchema).min(1).max(40),
  evidence: VentureRecommendationEvidenceSchema,
  gateResults: GateResultsSchema,
  designLab: DesignLabSchema,
  owner: OwnerFieldsSchema
}).superRefine((recommendation, context) => {
  if (recommendation.evidence.kind === "monitor-cluster" && recommendation.ventureId !== "kvorum") {
    context.addIssue({ code: "custom", message: "monitor-cluster evidence belongs to kvorum", path: ["ventureId"] });
  }
  if (Date.parse(recommendation.updatedAt) < Date.parse(recommendation.createdAt)) {
    context.addIssue({ code: "custom", message: "updatedAt cannot precede createdAt", path: ["updatedAt"] });
  }
  const createdAt = Date.parse(recommendation.createdAt);
  const updatedAt = Date.parse(recommendation.updatedAt);
  const recordedTimes: Array<{ value: string | null; path: PropertyKey[] }> = [
    { value: recommendation.gateResults.evaluatedAt, path: ["gateResults", "evaluatedAt"] },
    { value: recommendation.designLab.requestedAt, path: ["designLab", "requestedAt"] },
    { value: recommendation.designLab.resolvedAt, path: ["designLab", "resolvedAt"] },
    { value: recommendation.owner.approvedAt, path: ["owner", "approvedAt"] },
    { value: recommendation.owner.postedAt, path: ["owner", "postedAt"] },
    { value: recommendation.owner.archivedAt, path: ["owner", "archivedAt"] },
    { value: recommendation.owner.rejectedAt, path: ["owner", "rejectedAt"] },
    ...recommendation.owner.editHistory.map((edit, index) => ({
      value: edit.editedAt,
      path: ["owner", "editHistory", index, "editedAt"]
    }))
  ];
  for (const recorded of recordedTimes) {
    if (recorded.value !== null) {
      const timestamp = Date.parse(recorded.value);
      if (timestamp < createdAt || timestamp > updatedAt) {
        context.addIssue({ code: "custom", message: "Recorded event must fall inside the record interval", path: recorded.path });
      }
    }
  }
  if (recommendation.designLab.requestedAt && recommendation.designLab.resolvedAt
    && Date.parse(recommendation.designLab.resolvedAt) < Date.parse(recommendation.designLab.requestedAt)) {
    context.addIssue({ code: "custom", message: "Design resolution cannot precede its request", path: ["designLab", "resolvedAt"] });
  }
  const platforms = new Set(recommendation.platforms);
  const formats = new Set(recommendation.formats);
  if (platforms.size !== recommendation.platforms.length) {
    context.addIssue({ code: "custom", message: "Platforms must be unique", path: ["platforms"] });
  }
  if (formats.size !== recommendation.formats.length) {
    context.addIssue({ code: "custom", message: "Formats must be unique", path: ["formats"] });
  }
  const copyIds = new Set<string>();
  const usedPlatforms = new Set<string>();
  const usedFormats = new Set<string>();
  for (const [index, block] of recommendation.copyBlocks.entries()) {
    if (copyIds.has(block.id)) {
      context.addIssue({ code: "custom", message: "Copy block ids must be unique", path: ["copyBlocks", index, "id"] });
    }
    copyIds.add(block.id);
    usedPlatforms.add(block.platform);
    usedFormats.add(block.format);
    if (!platforms.has(block.platform)) {
      context.addIssue({ code: "custom", message: "Copy platform must be declared", path: ["copyBlocks", index, "platform"] });
    }
    if (!formats.has(block.format)) {
      context.addIssue({ code: "custom", message: "Copy format must be declared", path: ["copyBlocks", index, "format"] });
    }
  }
  if ([...platforms].some((platform) => !usedPlatforms.has(platform))) {
    context.addIssue({ code: "custom", message: "Every declared platform requires copy", path: ["platforms"] });
  }
  if ([...formats].some((format) => !usedFormats.has(format))) {
    context.addIssue({ code: "custom", message: "Every declared format requires copy", path: ["formats"] });
  }
  const claimIds = new Set(recommendation.evidence.claims.map((claim) => claim.id));
  for (const [gateIndex, gate] of recommendation.gateResults.results.entries()) {
    for (const [claimIndex, claimId] of gate.claimIds.entries()) {
      if (!claimIds.has(claimId)) {
        context.addIssue({ code: "custom", message: "Gate claim id must resolve", path: ["gateResults", "results", gateIndex, "claimIds", claimIndex] });
      }
    }
  }
  const owner = recommendation.owner;
  if (new Set(owner.resultRefs).size !== owner.resultRefs.length) {
    context.addIssue({ code: "custom", message: "Owner result refs must be unique", path: ["owner", "resultRefs"] });
  }
  for (const [index, edit] of owner.editHistory.entries()) {
    if (new Set(edit.fields).size !== edit.fields.length) {
      context.addIssue({ code: "custom", message: "Edit fields must be unique", path: ["owner", "editHistory", index, "fields"] });
    }
  }
  if (owner.approvedAt && owner.postedAt && Date.parse(owner.postedAt) < Date.parse(owner.approvedAt)) {
    context.addIssue({ code: "custom", message: "Posting cannot precede approval", path: ["owner", "postedAt"] });
  }
  if (owner.postedAt && owner.archivedAt && Date.parse(owner.archivedAt) < Date.parse(owner.postedAt)) {
    context.addIssue({ code: "custom", message: "Archiving cannot precede posting", path: ["owner", "archivedAt"] });
  }
  const noApproval = owner.approvedAt === null && owner.postedAt === null && owner.archivedAt === null
    && owner.rejectedAt === null && owner.rejectionReason === null && owner.postedUrl === null;
  if (recommendation.status === "draft" && !noApproval) {
    context.addIssue({ code: "custom", message: "Draft cannot claim an owner decision or posting", path: ["owner"] });
  }
  if (recommendation.status === "approved" && (
    owner.approvedAt === null || owner.postedAt !== null || owner.postedUrl !== null
    || owner.archivedAt !== null || owner.rejectedAt !== null || owner.rejectionReason !== null
  )) {
    context.addIssue({ code: "custom", message: "Approved status requires only approvedAt", path: ["owner"] });
  }
  if ((recommendation.status === "posted" || recommendation.status === "archived") && (
    owner.approvedAt === null || owner.postedAt === null || owner.postedUrl === null
    || owner.rejectedAt !== null || owner.rejectionReason !== null
  )) {
    context.addIssue({ code: "custom", message: "Posted lifecycle requires approval, manual URL and timestamps", path: ["owner"] });
  }
  if (recommendation.status === "archived" && owner.archivedAt === null) {
    context.addIssue({ code: "custom", message: "Archived status requires archivedAt", path: ["owner", "archivedAt"] });
  }
  if (recommendation.status !== "archived" && owner.archivedAt !== null) {
    context.addIssue({ code: "custom", message: "Only archived status carries archivedAt", path: ["owner", "archivedAt"] });
  }
  if (recommendation.status === "rejected" && (
    owner.rejectedAt === null || owner.rejectionReason === null || owner.approvedAt !== null
    || owner.postedAt !== null || owner.postedUrl !== null || owner.archivedAt !== null
  )) {
    context.addIssue({ code: "custom", message: "Rejected status requires only its owner reason and timestamp", path: ["owner"] });
  }
  if (recommendation.status !== "posted" && recommendation.status !== "archived" && owner.resultRefs.length > 0) {
    context.addIssue({ code: "custom", message: "Results may be linked only after manual posting", path: ["owner", "resultRefs"] });
  }
});

export type VentureRecommendation = z.infer<typeof VentureRecommendationSchema>;
