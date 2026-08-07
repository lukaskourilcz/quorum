import { createHash } from "node:crypto";
import { z } from "zod";
import type { Brand } from "./config.js";

/**
 * A bounded, one-way delivery contract for a static house banner.
 *
 * It is deliberately not the edition contract. An edition is a story with sources, a slug and a
 * locale; this is one image and one line of configuration, and modelling it as an edition would
 * let it inherit an edition's permissions. Every field a receiving repository is allowed to
 * receive is listed here, and nothing in it is executable: no script, no external request, no
 * remote font.
 */
export const MarketingSharkBannerContract = z.object({
  schemaVersion: z.literal("marketingshark-banner/1"),
  brandId: z.literal("devshark"),
  targetRepo: z.literal("lukaskourilcz/aifirst"),
  /** Written only when the target repository has no banner slot of its own yet. */
  fallbackSpec: z.boolean(),
  files: z.array(z.object({
    path: z.string().regex(/^(?:public|config|components)\/[A-Za-z0-9._/-]+$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().positive()
  })).min(1),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  /** The one-time owner approval this delivery waits on. */
  humanApprovalRef: z.string().min(1),
  preparedAt: z.iso.datetime({ offset: true }),
  status: z.enum(["staged", "delivered"]),
  receiptRef: z.string().nullable()
}).superRefine((contract, context) => {
  // geoShark never gets a banner anywhere. Pinned by the venture config schema and again here,
  // because this is the file that would actually place one.
  if (contract.brandId !== "devshark") {
    context.addIssue({ code: "custom", message: "Only devShark has a banner", path: ["brandId"] });
  }
});
export type MarketingSharkBannerContract = z.infer<typeof MarketingSharkBannerContract>;

export const BANNER_UTM = "utm_source=dneskai&utm_medium=banner&utm_campaign=devshark-house";

/**
 * DNESKAi's banner slot, as this venture would create it.
 *
 * Supplied only because the target repository has no slot of its own: its `config/` holds
 * `board-changelog.json` and `topics.yml` and nothing else, verified at e5e9b4f. If a slot lands
 * there later, its values win and this is dropped.
 *
 * `enabled: false` is the shipped default. The asset and the wiring arrive first and a person
 * turns it on, so a delivery cannot place a banner on the reader site by itself.
 */
export function bannerSlotConfig(brand: Brand) {
  return {
    enabled: false,
    slotId: "house-banner",
    position: "below-article-footer",
    maxWidth: "720px",
    height: { desktop: 120, mobile: 90 },
    href: `${brand.productUrl}?${BANNER_UTM}`,
    asset: "public/banners/devshark.svg",
    alt: "devShark — kvízová hra pro vývojáře",
    // DNESKAi does not sell advertising and must not look like it does. The label is the
    // difference between a house note and an ad, and it is not a style choice.
    label: "vlastní projekt"
  };
}

/**
 * The banner itself: one static SVG, self-contained.
 *
 * No script, no external font, no remote request, so it is CSP-safe wherever it is hosted. The
 * palette is devShark's own Deep End ocean ink and its subject-registry green, read from
 * `client/src/styles/astryx-theme.css` and `client/src/lib/subjects.ts`. The type is a system
 * stack rather than a webfont for the same reason the studio uses one: a font that has to be
 * fetched is a request, and this asset makes none.
 *
 * The copy claims nothing that cannot be checked. No user count, no ranking, no testimonial --
 * a line about what the product is, and its address.
 */
export function bannerSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="120" viewBox="0 0 720 120" role="img" aria-label="devShark — kvízová hra pro vývojáře. devshark.app">
  <title>devShark — kvízová hra pro vývojáře</title>
  <rect width="720" height="120" rx="12" fill="#0b141b"/>
  <rect x="0.5" y="0.5" width="719" height="119" rx="11.5" fill="none" stroke="#16242d"/>
  <path d="M32 74C44 70 58 58 64 34c10 16 14 30 14 40z" fill="#4caf50"/>
  <path d="M30 82c8-3 16-3 24 0s16 3 24 0" fill="none" stroke="#4caf50" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
  <text x="92" y="52" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700" fill="#e8eef0">devShark</text>
  <text x="92" y="82" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#9db3bc">Kvízová hra, se kterou budeš lepší vývojář.</text>
  <text x="692" y="52" text-anchor="end" font-family="Courier New, monospace" font-size="16" fill="#4caf50">devshark.app</text>
  <text x="692" y="82" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="12" letter-spacing="0.08em" fill="#6f858f">VLASTNÍ PROJEKT</text>
</svg>
`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** The hash the receiving side verifies, over every file in the payload rather than one of them. */
export function payloadHashOf(files: ReadonlyArray<{ path: string; sha256: string }>): string {
  return createHash("sha256")
    .update([...files].sort((left, right) => (left.path < right.path ? -1 : 1))
      .map((file) => `${file.path}:${file.sha256}`).join("\n"))
    .digest("hex");
}

/**
 * Assert the asset carries nothing executable or remote before it is ever staged.
 *
 * Two exclusions, and both are about what a URL in an SVG actually does. `xmlns` names the SVG
 * namespace and is required for a standalone file; a renderer never fetches it. `url(#id)`
 * references another element in the same document, which is how every gradient and clip path in
 * this repository's own templates is written. Everything else that looks like a fetch is one.
 */
export function assertBannerIsInert(svg: string): void {
  const withoutNamespaces = svg.replace(/xmlns(?::[a-z]+)?\s*=\s*"[^"]*"/giu, "");
  const forbidden: Array<[RegExp, string]> = [
    [/<script/iu, "a script tag"],
    [/\son\w+\s*=/iu, "an inline event handler"],
    [/https?:\/\//iu, "an external request"],
    [/@import/iu, "an imported stylesheet"],
    [/url\s*\(\s*['"]?(?!#)/iu, "an external font or resource"],
    [/<foreignObject/iu, "embedded markup"],
    [/<image/iu, "a raster image"]
  ];
  for (const [pattern, what] of forbidden) {
    if (pattern.test(withoutNamespaces)) throw new Error(`The banner asset contains ${what}`);
  }
}
