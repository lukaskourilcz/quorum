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
  /**
   * True only when the target repository has no banner slot of its own.
   *
   * It is false, and the story of why is worth keeping: this was staged against a shallow clone
   * taken at aifirst e5e9b4f, where `config/` held `board-changelog.json` and `topics.yml` and
   * nothing else. The slot landed at 5a94146 a few hours later, during the same session. A
   * payload built for the absent case would have overwritten a live `banner-slot/1` config with
   * an incompatible flat object -- so the target is re-read at staging time now, and this flag is
   * derived from what is actually there rather than from what was there when the work started.
   */
  fallbackSpec: z.boolean(),
  files: z.array(z.object({
    path: z.string().regex(/^(?:public|config)\/[A-Za-z0-9._/-]+$/),
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

/** The slot DNESKAi reserves, and the only one this venture may fill. */
export const BANNER_SLOT_ID = "today-partner-belt";

/** IAB standard sizes, which is what the target's own component documents and renders. */
export const BANNER_SIZES = {
  desktop: { width: 728, height: 90 },
  mobile: { width: 320, height: 100 }
} as const;

/** The target enforces this prefix: a creative outside it reads as an empty slot. */
export const BANNER_ASSET_PREFIX = "/images/banners/";

/**
 * DNESKAi's banner slot, filled — in the target's own `banner-slot/1` shape.
 *
 * The whole file is emitted rather than a fragment because the delivery channel writes files and
 * carries no merge semantics. That is safe only because the target holds exactly one slot and its
 * every field is reproduced here; if it ever holds two, this has to become a merge or it will
 * silently blank the other one. A test pins the slot set against the target's committed config.
 *
 * `active: false` is the shipped default. The creatives and the wiring arrive first and a person
 * turns the slot on, so a delivery cannot place a banner on the reader site by itself.
 *
 * The site renders its own label — `Partner`, from its dictionary — so the honest disclosure has
 * to live in the fields this side owns. `advertiser` reaches the reader through the component's
 * aria-label, and the alt text carries it too: DNESKAi does not sell partner placements and a
 * house project must not read as one.
 */
export function bannerSlotConfig(brand: Brand) {
  return {
    schemaVersion: "banner-slot/1",
    slots: {
      [BANNER_SLOT_ID]: {
        active: false,
        advertiser: `${brand.displayName} (vlastní projekt)`,
        href: `${brand.productUrl}?${BANNER_UTM}`,
        alt: "devShark, vlastní projekt BoardlessAI — kvízová hra pro vývojáře",
        desktop: {
          src: `${BANNER_ASSET_PREFIX}devshark-728x90.svg`,
          width: BANNER_SIZES.desktop.width,
          height: BANNER_SIZES.desktop.height
        },
        mobile: {
          src: `${BANNER_ASSET_PREFIX}devshark-320x100.svg`,
          width: BANNER_SIZES.mobile.width,
          height: BANNER_SIZES.mobile.height
        }
      }
    }
  };
}

/**
 * The creatives: two static SVGs at the target's two IAB sizes, self-contained.
 *
 * No script, no external font, no remote request, so each is CSP-safe wherever it is hosted. The
 * palette is devShark's own Deep End ocean ink and its subject-registry green, read from
 * `client/src/styles/astryx-theme.css` and `client/src/lib/subjects.ts`. The type is a system
 * stack rather than a webfont for the same reason the studio uses one: a font that has to be
 * fetched is a request, and these assets make none.
 *
 * The copy claims nothing that cannot be checked. No user count, no ranking, no testimonial — a
 * line about what the product is, its address, and the disclosure that it is a house project.
 */
export function bannerSvg(size: keyof typeof BANNER_SIZES = "desktop"): string {
  const { width, height } = BANNER_SIZES[size];
  const label = "devShark, vlastní projekt — kvízová hra pro vývojáře. devshark.app";
  if (size === "mobile") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
  <title>devShark — kvízová hra pro vývojáře</title>
  <rect width="${width}" height="${height}" rx="8" fill="#0b141b"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="7.5" fill="none" stroke="#16242d"/>
  <path d="M22 60C31 57 41 48 45 30c8 12 11 22 11 30z" fill="#4caf50"/>
  <path d="M20 68c6-2 12-2 18 0s12 2 18 0" fill="none" stroke="#4caf50" stroke-width="2.5" stroke-linecap="round" opacity="0.55"/>
  <text x="68" y="40" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#e8eef0">devShark</text>
  <text x="68" y="60" font-family="Courier New, monospace" font-size="13" fill="#4caf50">devshark.app</text>
  <text x="68" y="78" font-family="Arial, Helvetica, sans-serif" font-size="9" letter-spacing="0.08em" fill="#6f858f">VLASTNÍ PROJEKT</text>
</svg>
`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
  <title>devShark — kvízová hra pro vývojáře</title>
  <rect width="${width}" height="${height}" rx="10" fill="#0b141b"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="9.5" fill="none" stroke="#16242d"/>
  <path d="M28 62C39 58 51 48 56 27c9 14 12 26 12 35z" fill="#4caf50"/>
  <path d="M26 70c7-2 14-2 21 0s14 2 21 0" fill="none" stroke="#4caf50" stroke-width="2.5" stroke-linecap="round" opacity="0.55"/>
  <text x="84" y="42" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="700" fill="#e8eef0">devShark</text>
  <text x="84" y="66" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#9db3bc">Kvízová hra, se kterou budeš lepší vývojář.</text>
  <text x="${width - 28}" y="42" text-anchor="end" font-family="Courier New, monospace" font-size="14" fill="#4caf50">devshark.app</text>
  <text x="${width - 28}" y="66" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="10" letter-spacing="0.08em" fill="#6f858f">VLASTNÍ PROJEKT</text>
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
