import { z } from "zod";
import { DateSchema } from "./common.js";

export const KvorumEntityKindSchema = z.enum(["person", "party", "institution", "topic"]);
export const KvorumEntityRoleSchema = z.enum([
  "government-member",
  "party-leader",
  "head-of-state"
]);

const AliasSchema = z.string().trim().min(2).max(120);

export const KvorumEntitySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: KvorumEntityKindSchema,
  canonicalName: z.string().trim().min(2).max(160),
  aliases: z.array(AliasSchema).min(1).max(12),
  weight: z.number().int().min(1).max(5),
  roles: z.array(KvorumEntityRoleSchema).max(3),
  note: z.string().trim().min(1).max(300)
}).superRefine((entity, context) => {
  if (entity.kind === "person" && entity.roles.length === 0) {
    context.addIssue({ code: "custom", message: "People require at least one tracked role", path: ["roles"] });
  }
  if (entity.kind !== "person" && entity.roles.length > 0) {
    context.addIssue({ code: "custom", message: "Only people may carry political roles", path: ["roles"] });
  }
});

function matchingKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/\s+/gu, " ")
    .trim();
}

const requiredStandingTopics = new Set([
  "public-media-funding",
  "ukraine-aid",
  "agrofert-conflict",
  "municipal-elections-2026",
  "senate-elections-2026"
]);

export const KvorumEntityLexiconSchema = z.object({
  schemaVersion: z.literal("kvorum-entities/1"),
  asOf: DateSchema,
  governance: z.object({
    ownerEditable: z.literal(true),
    deskMutation: z.literal("proposal-only"),
    proposalPath: z.literal("state/ventures/kvorum/entity-proposals")
  }),
  matching: z.object({
    locale: z.literal("cs-CZ"),
    caseFold: z.literal(true),
    diacriticFold: z.literal(true),
    wholeWords: z.literal(true)
  }),
  entities: z.array(KvorumEntitySchema).min(9).max(160)
}).superRefine((lexicon, context) => {
  const ids = new Set<string>();
  const terms = new Map<string, string>();
  const kinds = new Set<string>();
  let governmentMembers = 0;
  let partyLeaders = 0;

  for (const [index, entity] of lexicon.entities.entries()) {
    kinds.add(entity.kind);
    if (ids.has(entity.id)) {
      context.addIssue({ code: "custom", message: "Entity ids must be unique", path: ["entities", index, "id"] });
    }
    ids.add(entity.id);
    if (entity.roles.includes("government-member")) governmentMembers += 1;
    if (entity.roles.includes("party-leader")) partyLeaders += 1;

    const localTerms = [entity.canonicalName, ...entity.aliases];
    const localKeys = new Set<string>();
    for (const [termIndex, term] of localTerms.entries()) {
      const key = matchingKey(term);
      const field = termIndex === 0 ? "canonicalName" : "aliases";
      const fieldIndex = termIndex === 0 ? undefined : termIndex - 1;
      const termPath = fieldIndex === undefined
        ? ["entities", index, field]
        : ["entities", index, field, fieldIndex];
      if (localKeys.has(key)) {
        context.addIssue({ code: "custom", message: "Canonical names and aliases must be distinct after matching normalization", path: termPath });
      }
      localKeys.add(key);
      const existing = terms.get(key);
      if (existing && existing !== entity.id) {
        context.addIssue({ code: "custom", message: `Matching term already belongs to ${existing}`, path: termPath });
      } else {
        terms.set(key, entity.id);
      }
    }
  }

  for (const kind of KvorumEntityKindSchema.options) {
    if (!kinds.has(kind)) {
      context.addIssue({ code: "custom", message: `Lexicon requires at least one ${kind}`, path: ["entities"] });
    }
  }
  if (governmentMembers === 0) {
    context.addIssue({ code: "custom", message: "Lexicon requires a government member", path: ["entities"] });
  }
  if (partyLeaders === 0) {
    context.addIssue({ code: "custom", message: "Lexicon requires a party leader", path: ["entities"] });
  }
  for (const topicId of requiredStandingTopics) {
    if (!ids.has(topicId)) {
      context.addIssue({ code: "custom", message: `Missing standing topic ${topicId}`, path: ["entities"] });
    }
  }
});

export type KvorumEntity = z.infer<typeof KvorumEntitySchema>;
export type KvorumEntityLexicon = z.infer<typeof KvorumEntityLexiconSchema>;
