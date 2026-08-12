import { z } from "zod";
import type { KvorumMonitorReceipt } from "../../contracts/kvorum-monitor.js";
import { sanitizeExternalContent, wrapUntrustedData } from "../../security/content.js";

const Sha1Schema = z.string().regex(/^[a-f0-9]{40}$/);
const RefTextSchema = z.strictObject({
  text: z.string().trim().min(1).max(2_000),
  refs: z.array(Sha1Schema).min(1).max(20)
});
const TribunClaimSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  type: z.enum(["fact-multi", "fact-single", "commentary"]),
  text: z.string().trim().min(1).max(1_000),
  refs: z.array(Sha1Schema).min(1).max(20)
});
const TribunPackageSchema = z.strictObject({
  clusterId: Sha1Schema,
  headline: z.string().trim().min(1).max(240),
  summary: RefTextSchema,
  whyItMatters: RefTextSchema,
  whyThisIsWorthIt: z.string().trim().min(1).max(1_000),
  ourAngle: z.string().trim().min(1).max(2_000),
  ourAngleDiffers: z.string().trim().min(1).max(2_000),
  stitAttribution: z.strictObject({
    summary: z.string().trim().min(1).max(1_000),
    itemRefs: z.array(Sha1Schema).min(1).max(30)
  }).nullable(),
  targets: z.array(z.strictObject({
    platform: z.enum(["instagram", "facebook", "threads", "x"]),
    format: z.enum(["carousel", "single-image", "thread", "caption"]),
    reason: z.string().trim().min(1).max(800),
    copy: z.string().trim().min(1).max(12_000),
    altText: z.string().trim().min(1).max(2_000).nullable()
  })).min(1).max(8),
  claims: z.array(TribunClaimSchema).min(1).max(80)
});

export const TribunDeskOutputSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("recommendations"),
    packages: z.array(TribunPackageSchema).min(1).max(2)
  }),
  z.strictObject({
    outcome: z.literal("quiet"),
    reason: z.string().trim().min(1).max(1_000),
    packages: z.tuple([])
  })
]);

export type TribunDeskOutput = z.infer<typeof TribunDeskOutputSchema>;
export type TribunPackage = z.infer<typeof TribunPackageSchema>;

const OUTPUT_SHAPE = `{"outcome":"recommendations","packages":[{"clusterId":"40-char ref","headline":"string","summary":{"text":"string","refs":["itemRef"]},"whyItMatters":{"text":"string","refs":["itemRef"]},"whyThisIsWorthIt":"string","ourAngle":"string","ourAngleDiffers":"string","stitAttribution":{"summary":"internal context only","itemRefs":["discovery-only itemRef"]}|null,"targets":[{"platform":"instagram|facebook|threads|x","format":"carousel|single-image|thread|caption","reason":"string","copy":"Czech draft","altText":"string|null"}],"claims":[{"id":"slug","type":"fact-multi|fact-single|commentary","text":"string","refs":["itemRef"]}]}]} OR {"outcome":"quiet","reason":"string","packages":[]}. Return one or two packages, never more.`;

function compactExternal(value: string, max = 600): string {
  return sanitizeExternalContent(value, max).text;
}

export function buildKvorumDeskPacket(receipt: KvorumMonitorReceipt): string {
  const clusters = new Map(receipt.clusters.map((cluster) => [cluster.id, cluster]));
  const digest = receipt.ranks
    .filter((rank) => rank.score > 0)
    .map((rank) => {
      const cluster = clusters.get(rank.clusterId)!;
      return {
        rank: rank.position,
        score: rank.score,
        factors: rank.factors,
        cluster: {
          id: cluster.id,
          title: compactExternal(cluster.title, 240),
          continuationOf: cluster.continuationOf,
          entityIds: cluster.entityIds,
          topicTokens: cluster.topicTokens,
          sources: cluster.attributions.map((source) => ({
            ...source,
            sourceName: compactExternal(source.sourceName, 120),
            excerpt: compactExternal(source.excerpt)
          }))
        }
      };
    });
  return [
    `Desk date: ${receipt.date}. Select only from the ranked digest below. Every factual sentence must cite its item refs. Štít/discoveryOnly rows are context, never factual evidence.`,
    wrapUntrustedData("kvorum-monitor-digest", JSON.stringify({ clusters: digest })),
    `Return exactly this JSON shape and nothing else:\n${OUTPUT_SHAPE}`
  ].join("\n\n");
}

export function fixtureTribunOutput(receipt: KvorumMonitorReceipt): TribunDeskOutput {
  const cluster = receipt.ranks
    .map((rank) => receipt.clusters.find((candidate) => candidate.id === rank.clusterId))
    .find((candidate) => candidate?.attributions.some((source) => source.discoveryOnly)
      && candidate.attributions.filter((source) => !source.discoveryOnly).length >= 2);
  if (!cluster) return { outcome: "quiet", reason: "The fixture has no corroborated cluster.", packages: [] };
  const direct = cluster.attributions.filter((source) => !source.discoveryOnly);
  const discovery = cluster.attributions.filter((source) => source.discoveryOnly);
  return TribunDeskOutputSchema.parse({
    outcome: "recommendations",
    packages: [{
      clusterId: cluster.id,
      headline: "Televizní poplatky se vracejí do Sněmovny",
      summary: {
        text: "Sněmovna znovu projednává způsob financování médií veřejné služby.",
        refs: direct.slice(0, 2).map((source) => source.itemRef)
      },
      whyItMatters: {
        text: "Rozhodnutí určí další krok debaty o předvídatelném financování veřejnoprávních médií.",
        refs: direct.slice(0, 2).map((source) => source.itemRef)
      },
      whyThisIsWorthIt: "Tři zdroje dovolují oddělit návrh, sněmovní proces a veřejnou reakci.",
      ourAngle: "Ukázat přesný proces a jeho dohledatelné další kroky.",
      ourAngleDiffers: "Kvórum nepřebírá výzvu discovery postu; porovnává dvě přímé zprávy a sleduje institucionální krok.",
      stitAttribution: {
        summary: "Štít téma rámoval jako spor o televizní poplatky; blok zůstává interní.",
        itemRefs: discovery.map((source) => source.itemRef)
      },
      targets: [{
        platform: "instagram",
        format: "carousel",
        reason: "Tři snímky mohou oddělit návrh, proces a dopad.",
        copy: "Televizní poplatky jsou znovu ve Sněmovně. Tady je návrh, další krok a to, co se skutečně mění.",
        altText: "Přehled návrhu a dalšího sněmovního kroku k financování médií veřejné služby."
      }],
      claims: [{
        id: "snemovni-projednani",
        type: "fact-multi",
        text: "Návrh se vrací do sněmovního projednávání.",
        refs: direct.slice(0, 2).map((source) => source.itemRef)
      }]
    }]
  });
}
