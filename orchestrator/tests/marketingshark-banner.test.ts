import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertBannerIsInert,
  BANNER_ASSET_PREFIX,
  BANNER_SIZES,
  BANNER_SLOT_ID,
  bannerSlotConfig,
  bannerSvg,
  BANNER_UTM,
  MarketingSharkBannerContract,
  payloadHashOf,
  sha256
} from "../src/ventures/marketingshark/banner.js";
import { loadMarketingSharkConfig } from "../src/ventures/marketingshark/config.js";
import { repoRoot } from "../src/paths.js";

const stagingRoot = path.join(repoRoot, "state", "ventures", "marketingshark", "banner");

describe("devShark house banner", () => {
  it("carries nothing executable, remote or tracked, at both sizes", () => {
    for (const size of ["desktop", "mobile"] as const) {
      const each = bannerSvg(size);
      expect(() => assertBannerIsInert(each)).not.toThrow();
      expect(each).not.toMatch(/<script|onload=|onclick=/iu);
      expect(each).toContain(`width="${BANNER_SIZES[size].width}"`);
      expect(each).toContain(`height="${BANNER_SIZES[size].height}"`);
    }
    const svg = bannerSvg();
    expect(() => assertBannerIsInert(svg)).not.toThrow();
    // The namespace declaration is not a request and a same-document url(#id) is not a fetch;
    // everything else that looks like one is.
    expect(() => assertBannerIsInert('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#g)"/></svg>')).not.toThrow();
    for (const hostile of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://tracker.example/p.gif"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://fonts.example/f.css)</style></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://a.example/x.png)"/></svg>'
    ]) {
      expect(() => assertBannerIsInert(hostile), hostile.slice(0, 60)).toThrow();
    }
  });

  it("claims only what can be checked, and labels itself honestly", () => {
    const svg = bannerSvg();
    // Read the words, not the markup. Checking the whole file for "#1" matches the hex colour
    // #16242d, which is how a truthfulness check ends up policing the palette.
    const words = [...svg.matchAll(/<(?:text|title)[^>]*>([^<]*)<\/(?:text|title)>/giu)]
      .map((match) => match[1] ?? "").join(" | ");

    expect(words).toContain("devShark");
    expect(words).toContain("devshark.app");
    // DNESKAi does not sell advertising and must not look like it does.
    expect(words).toContain("VLASTNÍ PROJEKT");
    // No user count, ranking or testimonial. A number in a house banner is a claim.
    expect(words).not.toMatch(/\d+\s*(?:\+|k\b|%|uživatel|users|developers)/iu);
    expect(words).not.toMatch(/nejlepší|number one|#\s?1\b|milion/iu);
    expect(svg).toMatch(/aria-label="[^"]+"/u);
  });

  it("fills the target's own slot shape and ships switched off", async () => {
    const config = await loadMarketingSharkConfig();
    const brand = config.brands.find((candidate) => candidate.id === "devshark")!;
    const slotConfig = bannerSlotConfig(brand);
    const slot = slotConfig.slots[BANNER_SLOT_ID]!;

    // banner-slot/1 is DNESKAi's schema, not this venture's. The first staging run was built
    // against a shallow clone taken hours before that slot landed and would have overwritten a
    // live config with an incompatible flat object.
    expect(slotConfig.schemaVersion).toBe("banner-slot/1");
    expect(Object.keys(slotConfig.slots)).toEqual([BANNER_SLOT_ID]);

    // The creatives and the wiring arrive first and a person turns the slot on, so a delivery
    // cannot place a banner on the reader site by itself.
    expect(slot.active).toBe(false);
    expect(slot.href).toBe(`https://devshark.app?${BANNER_UTM}`);

    // The target renders its own "Partner" label, so the disclosure has to live in the fields
    // this side owns or DNESKAi reads as if it sells partner placements.
    expect(slot.advertiser).toContain("vlastní projekt");
    expect(slot.alt).toContain("vlastní projekt");

    // The target refuses any creative outside this prefix, and reads the refusal as an empty
    // slot rather than an error, so a wrong path fails silently in production.
    for (const creative of [slot.desktop, slot.mobile]) {
      expect(creative.src.startsWith(BANNER_ASSET_PREFIX)).toBe(true);
    }
    expect(slot.desktop).toMatchObject(BANNER_SIZES.desktop);
    expect(slot.mobile).toMatchObject(BANNER_SIZES.mobile);
  });

  it("keeps the staged payload parseable by the target's own validator", async () => {
    // A transcription of lib/banner.ts from lukaskourilcz/aifirst at 5a94146. The staged config
    // has to survive it, and has to survive it as an INACTIVE slot: anything malformed reads as
    // empty there rather than throwing, so a broken payload looks exactly like an unfilled slot.
    const LOCAL_PREFIX = "/images/banners/";
    const creative = (value: unknown) => {
      if (typeof value !== "object" || value === null) return null;
      const { src, width, height } = value as Record<string, unknown>;
      if (typeof src !== "string" || !src.startsWith(LOCAL_PREFIX)) return null;
      if (typeof width !== "number" || typeof height !== "number") return null;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
      return { src, width, height };
    };

    const staged = JSON.parse(await readFile(
      path.join(stagingRoot, "payload", "config", "banner.json"), "utf8")) as {
        schemaVersion: string;
        slots: Record<string, Record<string, unknown>>;
      };

    expect(staged.schemaVersion).toBe("banner-slot/1");
    const slot = staged.slots[BANNER_SLOT_ID]!;
    expect(slot.active).toBe(false);
    expect(typeof slot.advertiser === "string" && slot.advertiser !== "").toBe(true);
    expect(typeof slot.href === "string" && slot.href !== "").toBe(true);
    expect(typeof slot.alt === "string" && slot.alt !== "").toBe(true);
    expect(creative(slot.desktop)).not.toBeNull();
    expect(creative(slot.mobile)).not.toBeNull();

    // Every creative the config names is actually in the payload, and the contract says the
    // target owns the slot rather than claiming to supply one.
    const contract = MarketingSharkBannerContract.parse(
      JSON.parse(await readFile(path.join(stagingRoot, "contract.json"), "utf8")));
    expect(contract.fallbackSpec).toBe(false);
    for (const value of [slot.desktop, slot.mobile]) {
      expect(contract.files.map((file) => file.path))
        .toContain(`public${(value as { src: string }).src}`);
    }
  });

  it("is staged with a payload hash and delivered to nothing", async () => {
    const contract = MarketingSharkBannerContract.parse(
      JSON.parse(await readFile(path.join(stagingRoot, "contract.json"), "utf8")));

    expect(contract.status).toBe("staged");
    expect(contract.receiptRef).toBeNull();
    expect(contract.targetRepo).toBe("lukaskourilcz/aifirst");
    expect(contract.humanApprovalRef).toContain("INBOX:");
    expect(contract.payloadHash).toBe(payloadHashOf(contract.files));

    // The hash is over what is actually staged, so an edited file cannot travel under an old hash.
    for (const file of contract.files) {
      const staged = await readFile(path.join(stagingRoot, "payload", file.path), "utf8");
      expect(sha256(staged), `${file.path} does not match its recorded hash`).toBe(file.sha256);
      expect(Buffer.byteLength(staged)).toBe(file.bytes);
    }
  });

  it("waits on an owner approval that is actually in the INBOX", async () => {
    const inbox = await readFile(path.join(repoRoot, "state", "INBOX.md"), "utf8");
    const pending = inbox.slice(0, inbox.indexOf("## Resolved"));
    expect(pending).toContain("HUMAN_APPROVAL DEVSHARK-BANNER-001");
    // An unticked box. A staged delivery whose approval was already ticked would be a delivery
    // nobody made a decision about.
    expect(pending).toMatch(/- \[ \] HUMAN_APPROVAL DEVSHARK-BANNER-001/u);
  });

  it("refuses a banner contract for any brand but devShark", () => {
    const geo = MarketingSharkBannerContract.safeParse({
      schemaVersion: "marketingshark-banner/1",
      brandId: "geoshark",
      targetRepo: "lukaskourilcz/aifirst",
      fallbackSpec: true,
      files: [{ path: "public/banners/geoshark.svg", sha256: "a".repeat(64), bytes: 10 }],
      payloadHash: "b".repeat(64),
      humanApprovalRef: "INBOX:x",
      preparedAt: "2026-08-07T00:00:00.000Z",
      status: "staged",
      receiptRef: null
    });
    expect(geo.success).toBe(false);
  });

  it("keeps geoShark's banner flag off in the shipped config", async () => {
    const config = await loadMarketingSharkConfig();
    expect(config.brands.find((brand) => brand.id === "geoshark")!.banner).toBe(false);
    expect(config.brands.find((brand) => brand.id === "devshark")!.banner).toBe(true);
  });
});
