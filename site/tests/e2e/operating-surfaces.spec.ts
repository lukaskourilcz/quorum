import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { CALENDAR_SLOTS } from "../../src/lib/calendar-feed-model";

const axeRoutes = [
  "/",
  "/meetings/2026-07-30-cu-edition",
  "/meetings/2026-07-30-cu-product",
  "/ideas",
  "/ventures/caught-up",
  "/ventures/titty-tuesdays",
  "/ventures/fightaiq",
  "/ventures/carousel-studio",
  "/ventures/booksofhistory",
  "/ventures/door-money",
  "/ventures/kvorum",
  "/ventures/tehdejsi-svet",
  "/money",
  "/admin?venture=global",
  "/admin?venture=door-money&tab=recommendations",
  "/admin?venture=door-money&tab=actions",
  "/admin?venture=door-money&tab=knowledge",
  "/admin?venture=titty-tuesdays&tab=plans",
  "/admin/ventures/titty-tuesdays/binder",
  "/admin?venture=fightaiq&tab=fighters",
  "/admin?venture=fightaiq&tab=events",
  "/admin?venture=fightaiq&tab=sources",
  "/admin?venture=mma-files&tab=articles",
  "/admin?venture=mma-files&tab=calendar",
  "/admin?venture=mma-files&tab=social-lab",
  "/admin?venture=booksofhistory&tab=shortlist",
  "/admin?venture=booksofhistory&tab=dossiers",
  "/admin?venture=booksofhistory&tab=features",
  "/admin?venture=tehdejsi-svet&tab=features",
  "/admin?venture=tehdejsi-svet&tab=library",
  "/admin?venture=tehdejsi-svet&tab=signals",
  "/admin?venture=carousel-studio&tab=studio",
  "/admin?venture=carousel-studio&tab=inspiration",
  "/admin?venture=kvorum&tab=recommendations",
  "/admin?venture=kvorum&tab=monitor",
  "/admin?venture=kvorum&tab=claims",
  "/meetings/2026-08-01-mma-intake",
  "/meetings/2026-08-01-mma-analysis",
  "/meetings/2026-08-01-mag-editorial",
  "/meetings/2026-08-01-mag-desk",
  "/meetings/2026-08-01-studio"
];

const repositoryRoot = path.resolve(process.cwd(), "..");
const e2ePlanPath = path.join(repositoryRoot, "state", "ventures", "titty-tuesdays", "plans", "e2e-launch-plan.json");
const e2eMarketingPackagePath = path.join(repositoryRoot, "state", "ventures", "marketingshark", "packages", "2026-08-09", "e2e-fixture", "package.json");
const ratingLedgerPath = path.join(repositoryRoot, "state", "ratings", "titty-tuesdays", "ledger.jsonl");
let originalRatingLedger: string | null = null;
/*
 * The Design Lab's controls write real state.
 *
 * Clicking a family chip is a save, by design — the whole point of DL-01 is that viewing and
 * keeping stopped being the same action, and the keeping half persists. So the suite snapshots
 * the two files it can touch and puts them back, the same as it does for the rating ledger.
 */
const deckOverridesPath = path.join(repositoryRoot, "state", "ventures", "carousel-studio", "deck-style-overrides.json");
const presetsPath = path.join(repositoryRoot, "state", "ventures", "carousel-studio", "presets.json");
let originalDeckOverrides: string | null = null;
const bhPaths = {
  shortlist: path.join(repositoryRoot, "state/ventures/booksofhistory/shortlists/e2e.json"),
  brief: path.join(repositoryRoot, "state/ventures/booksofhistory/briefs/e2e.json"),
  cycle: path.join(repositoryRoot, "state/ventures/booksofhistory/cycle.json"),
  dossier: path.join(repositoryRoot, "state/ventures/booksofhistory/dossiers/war-with-the-newts/dossier.json"),
  ledger: path.join(repositoryRoot, "state/ventures/booksofhistory/research-ledger.jsonl"),
  recommendation: path.join(repositoryRoot, "state/ventures/booksofhistory/recommendations/e2e-feature.json"),
  ratings: path.join(repositoryRoot, "state/ratings/booksofhistory/ledger.jsonl")
};
const originalBhFiles = new Map<string, string | null>();
const tsPaths = {
  recommendation: path.join(repositoryRoot, "state/ventures/tehdejsi-svet/drafts/e2e-feature.json"),
  result: path.join(repositoryRoot, "state/ventures/tehdejsi-svet/results/result-1234567890abcdef1234.json")
};
const tsUnreadablePath = path.join(repositoryRoot, "state/ventures/tehdejsi-svet/drafts/e2e-unreadable.json");
const originalTsFiles = new Map<string, string | null>();
const additionalRatingPaths = ["door-money", "tehdejsi-svet", "kvorum"].map((ventureId) =>
  path.join(repositoryRoot, "state", "ratings", ventureId, "ledger.jsonl"));
const originalAdditionalRatings = new Map<string, string | null>();
const bhActionDirectory = path.join(repositoryRoot, "state/ventures/booksofhistory/feature-actions/rec-e2e-admin-feature");
const bhSummaryPaths = ["cs", "en"].map((locale) => path.join(repositoryRoot, `state/ventures/carousel-studio/summaries/booksofhistory/2026-08-14-e2e-admin-feature-${locale}.json`));
const kvorumRecommendationPath = path.join(repositoryRoot, "state/ventures/kvorum/recommendations/2026-08-12-public-media.json");
const kvorumRecommendationIndexPath = path.join(repositoryRoot, "state/ventures/kvorum/recommendations/index.json");
const kvorumMonitorPath = path.join(repositoryRoot, "state/ventures/kvorum/monitor/2026-08-12.json");
const kvorumSummaryPath = path.join(repositoryRoot, "state/ventures/carousel-studio/summaries/kvorum/2026-08-12-public-media.json");
const kvorumClaimIds = ["claim-snemovna", "claim-process", "claim-angle"] as const;
const kvorumClaimPaths = kvorumClaimIds.map((claimId) =>
  path.join(repositoryRoot, `state/ventures/kvorum/claims/2026-08-12-public-media-${claimId}.json`));
const correctionClaimId = "kv-claim-2026-08-12-public-media-claim-snemovna";
const correctionDigest = createHash("sha256").update(correctionClaimId).digest("hex").slice(0, 10);
const correctionDate = new Date().toISOString().slice(0, 10);
const kvorumCorrectionPath = path.join(
  repositoryRoot,
  `state/ventures/kvorum/recommendations/${correctionDate}-correction-claim-snemovna-${correctionDigest}.json`
);
const kvorumFixturePaths = [
  kvorumRecommendationPath,
  kvorumRecommendationIndexPath,
  kvorumMonitorPath,
  kvorumSummaryPath,
  ...kvorumClaimPaths,
  kvorumCorrectionPath
] as const;
const originalKvorumState = new Map<string, string | null>();

test.beforeAll(async () => {
  try {
    originalRatingLedger = await readFile(ratingLedgerPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    originalDeckOverrides = await readFile(deckOverridesPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const target of Object.values(bhPaths)) {
    try { originalBhFiles.set(target, await readFile(target, "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      originalBhFiles.set(target, null);
    }
  }
  for (const target of Object.values(tsPaths)) {
    try { originalTsFiles.set(target, await readFile(target, "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      originalTsFiles.set(target, null);
    }
  }
  for (const target of additionalRatingPaths) {
    try { originalAdditionalRatings.set(target, await readFile(target, "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      originalAdditionalRatings.set(target, null);
    }
  }
  for (const target of kvorumFixturePaths) {
    try { originalKvorumState.set(target, await readFile(target, "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      originalKvorumState.set(target, null);
    }
  }
  await Promise.all([
    mkdir(path.dirname(e2ePlanPath), { recursive: true }),
    mkdir(path.dirname(e2eMarketingPackagePath), { recursive: true }),
    mkdir(path.dirname(ratingLedgerPath), { recursive: true }),
    ...Object.values(bhPaths).map((target) => mkdir(path.dirname(target), { recursive: true })),
    ...Object.values(tsPaths).map((target) => mkdir(path.dirname(target), { recursive: true })),
    ...additionalRatingPaths.map((target) => mkdir(path.dirname(target), { recursive: true })),
    mkdir(path.dirname(kvorumRecommendationPath), { recursive: true }),
    mkdir(path.dirname(kvorumMonitorPath), { recursive: true }),
    mkdir(path.dirname(kvorumClaimPaths[0]!), { recursive: true }),
    mkdir(path.dirname(kvorumSummaryPath), { recursive: true })
  ]);
  await writeFile(e2ePlanPath, JSON.stringify({
    schemaVersion: "marketing-plan/1",
    id: "plan-e2e-launch",
    ventureId: "titty-tuesdays",
    seasonId: "season-001",
    title: "E2E launch binder plan",
    objective: "Verify the protected launch binder without authorizing commerce or publishing.",
    tactics: [{
      type: "content",
      description: "Prepare a review-only launch note.",
      assetsNeeded: [],
      platformPolicyNote: "Draft only; no external action."
    }],
    calendar: [{ week: 1, focus: "Owner review." }],
    audienceRefs: [],
    kpis: ["owner review complete"],
    assets: ["staged/e2e-launch.json"],
    status: "approved",
    originMeetingRef: "meetings/2026-08-01-tt-marketing"
  }));
  await writeFile(e2eMarketingPackagePath, JSON.stringify({
    status: "draft",
    question: { id: "e2e-question", category: "proof" },
    hooks: {
      a: { patternId: "fact-first", en: "Show the package card." },
      b: { patternId: "question-led", en: "Ask before publishing." }
    },
    render: { summaryPaths: ["staged/e2e-package.json"] }
  }));
  const fixture = async (name: string) => readFile(path.join(repositoryRoot, "contracts/fixtures", name), "utf8");
  const recommendation = JSON.parse(await fixture("booksofhistory-recommendation.valid.json")) as { recommendationId: string };
  recommendation.recommendationId = "rec-e2e-admin-feature";
  const tsRecommendation = JSON.parse(await fixture("venture-recommendation-tehdejsi.valid.json")) as Record<string, unknown>;
  tsRecommendation.status = "posted";
  tsRecommendation.owner = {
    postedUrls: {
      cs: "https://www.instagram.com/p/synthetic-e2e-cs/",
      ua: "https://www.instagram.com/p/synthetic-e2e-ua/"
    },
    rejectionReason: null
  };
  tsRecommendation.updatedAt = "2026-08-20T12:05:00.000Z";
  const tsResult = JSON.parse(await fixture("tehdejsi-owner-result-entry.valid.json")) as Record<string, unknown>;
  tsResult.recommendationId = tsRecommendation.id;
  tsResult.postUrl = (tsRecommendation.owner as { postedUrls: { cs: string } }).postedUrls.cs;
  const kvorumRecommendation = JSON.parse(await fixture("kvorum-venture-recommendation.valid.json")) as Record<string, unknown> & {
    gateResults: { evaluatedAt: string };
  };
  kvorumRecommendation.createdAt = "2026-08-12T10:00:00.000Z";
  kvorumRecommendation.updatedAt = "2026-08-12T10:00:00.000Z";
  kvorumRecommendation.gateResults.evaluatedAt = "2026-08-12T10:00:00.000Z";
  await Promise.all([
    writeFile(bhPaths.shortlist, await fixture("bh-shortlist.valid.json")),
    writeFile(bhPaths.brief, await fixture("bh-research-brief.valid.json")),
    writeFile(bhPaths.cycle, await fixture("bh-cycle.valid.json")),
    writeFile(bhPaths.dossier, await fixture("bh-dossier.valid.json")),
    writeFile(bhPaths.ledger, `${JSON.stringify(JSON.parse(await fixture("bh-research-ledger.valid.json")))}\n`),
    writeFile(bhPaths.recommendation, `${JSON.stringify(recommendation, null, 2)}\n`),
    writeFile(bhPaths.ratings, ""),
    writeFile(tsPaths.recommendation, `${JSON.stringify(tsRecommendation, null, 2)}\n`),
    writeFile(tsPaths.result, `${JSON.stringify(tsResult, null, 2)}\n`),
    ...additionalRatingPaths.map((target) => writeFile(target, "")),
    writeFile(kvorumRecommendationPath, `${JSON.stringify(kvorumRecommendation, null, 2)}\n`),
    writeFile(kvorumRecommendationIndexPath, `${JSON.stringify({
      schemaVersion: "kvorum-recommendation-index/1",
      date: "2026-08-12",
      generatedAt: "2026-08-12T10:00:00.000Z",
      queue: [{
        id: kvorumRecommendation.id,
        ref: "state/ventures/kvorum/recommendations/2026-08-12-public-media.json",
        clusterId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status: "draft",
        headline: kvorumRecommendation.headline,
        createdAt: kvorumRecommendation.createdAt
      }]
    }, null, 2)}\n`),
    writeFile(kvorumMonitorPath, await fixture("kvorum-monitor.valid.json")),
    rm(kvorumSummaryPath, { force: true }),
    ...kvorumClaimPaths.map((target) => rm(target, { force: true })),
    rm(kvorumCorrectionPath, { force: true })
  ]);
});

test.afterAll(async () => {
  await rm(e2ePlanPath, { force: true });
  await rm(e2eMarketingPackagePath, { force: true });
  if (originalRatingLedger === null) await rm(ratingLedgerPath, { force: true });
  else await writeFile(ratingLedgerPath, originalRatingLedger);
  await rm(presetsPath, { force: true });
  if (originalDeckOverrides === null) await rm(deckOverridesPath, { force: true });
  else await writeFile(deckOverridesPath, originalDeckOverrides);
  for (const [target, original] of originalBhFiles) {
    if (original === null) await rm(target, { force: true });
    else await writeFile(target, original);
  }
  for (const [target, original] of originalTsFiles) {
    if (original === null) await rm(target, { force: true });
    else await writeFile(target, original);
  }
  for (const [target, original] of originalAdditionalRatings) {
    if (original === null) await rm(target, { force: true });
    else await writeFile(target, original);
  }
  await rm(tsUnreadablePath, { force: true });
  for (const target of kvorumFixturePaths) {
    const original = originalKvorumState.get(target) ?? null;
    if (original === null) await rm(target, { force: true });
    else await writeFile(target, original);
  }
  await rm(bhActionDirectory, { recursive: true, force: true });
  await Promise.all(bhSummaryPaths.map((target) => rm(target, { force: true })));
});

for (const route of axeRoutes) {
  test(`WCAG AA operating surface — ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}

test("Door Money renders its three bounded admin tabs", async ({ page }) => {
  await page.goto("/admin?venture=door-money&tab=recommendations", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Door Money" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Door Money/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "recommendations" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "actions" })).toBeVisible();
  await expect(page.getByRole("link", { name: "knowledge" })).toBeVisible();
  await expect(page.getByText(/No Door Money recommendation store exists yet\.|No readable Door Money recommendations are stored\./u)).toBeVisible();
  await expect(page.getByText("0 on this tab")).toBeVisible();

  await page.getByRole("link", { name: "actions" }).click();
  await expect(page).toHaveURL(/tab=actions/);
  await expect(page.getByText("No Door Money action packets or playbooks exist yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark complete" })).toHaveCount(0);

  await page.getByRole("link", { name: "knowledge" }).click();
  await expect(page).toHaveURL(/tab=knowledge/);
  await expect(page.getByText("No Door Money knowledge version exists yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: /ingest/i })).toHaveCount(0);
});

test("Tehdejsi svet renders its three bounded admin tabs", async ({ page }) => {
  await page.goto("/admin?venture=tehdejsi-svet&tab=features", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Tehdejší svět" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Tehdejší svět/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "features" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "library" })).toBeVisible();
  await expect(page.getByRole("link", { name: "signals" })).toBeVisible();
  await expect(page.getByText("No shortlist has been recorded yet.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Czech performance" })).toBeVisible();
  await expect(page.getByText("Sends (primary)").first()).toBeVisible();
  await expect(page.getByText("Saves (primary)").first()).toBeVisible();
  await expect(page.locator('[data-tehdejsi-results="cs"]')).toContainText("17");
  await expect(page.locator('[data-tehdejsi-results="cs"]')).toContainText("23");

  await page.getByRole("link", { name: "library" }).click();
  await expect(page).toHaveURL(/tab=library/);
  await expect(page.getByRole("heading", { name: "Facts-file status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Facts browser" })).toBeVisible();
  await expect(page.getByText("5 on this tab")).toBeVisible();

  await page.getByRole("link", { name: "signals" }).click();
  await expect(page).toHaveURL(/tab=signals/);
  await expect(page.getByRole("heading", { name: "Community memory" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product insight queue" })).toBeVisible();
  await expect(page.getByText("5 on this tab")).toBeVisible();
});

test("Kvórum exposes three truthful owner-workspace tabs", async ({ page }) => {
  await page.goto("/admin?venture=kvorum&tab=recommendations", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "recommendations", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "monitor", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "claims", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Poplatky se vracejí do Sněmovny" })).toBeVisible();
  await expect(page.getByText("1 on this tab", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "monitor", exact: true }).click();
  await expect(page).toHaveURL(/venture=kvorum&tab=monitor/u);
  await expect(page.getByText("Source health · recorded response", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Financování médií veřejné služby" })).toBeVisible();

  await page.getByRole("link", { name: "claims", exact: true }).click();
  await expect(page).toHaveURL(/venture=kvorum&tab=claims/u);
  await expect(page.getByText("The claims store exists and contains no record.", { exact: true })).toBeVisible();
  await expect(page.getByText("0 on this tab", { exact: true })).toBeVisible();
});

test("the admin home answers what happened since yesterday for every new venture", async ({ page }) => {
  await page.goto("/admin?venture=global", { waitUntil: "networkidle" });
  const panel = page.locator("[data-admin-recent-activity]");
  await expect(panel).toBeVisible();
  for (const ventureId of ["booksofhistory", "door-money", "tehdejsi-svet", "kvorum"]) {
    const card = panel.locator(`[data-recent-venture="${ventureId}"]`);
    await expect(card).toBeVisible();
    await expect(card).toContainText("since yesterday");
    await expect(card).toHaveAttribute("href", `/admin?venture=${ventureId}`);
  }
});

test("every new venture workspace exposes its configured meeting controls", async ({ page }) => {
  const expected = {
    booksofhistory: ["FOLIO", "PLOT", "QUILL", "HACEK", "AUDIT"],
    "door-money": ["GHOST", "BOOKER", "PULSE", "AUDIT", "PALATE"],
    "tehdejsi-svet": ["LETOPIS", "VERBA", "QUILL", "HACEK", "AUDIT"],
    kvorum: ["TRIBUN", "HACEK", "AUDIT", "PALATE", "KEEPER"]
  } as const;
  for (const [ventureId, roles] of Object.entries(expected)) {
    await page.goto(`/admin?venture=${ventureId}`, { waitUntil: "networkidle" });
    const controls = page.getByRole("region", { name: "Choose who joins new work" });
    await expect(controls).toBeVisible();
    for (const role of roles) await expect(controls.getByText(role, { exact: true })).toBeVisible();
    await expect(controls.getByRole("switch")).toHaveCount(roles.length);
  }
});

test("approvals and owner-only work include all four new ventures", async ({ page }) => {
  await page.goto("/admin?view=approvals", { waitUntil: "networkidle" });
  for (const approval of ["BH-RESEARCH-001", "DM-RESULTS-004", "TS-SNAPSHOT-001", "KV-EDITORIAL-004"]) {
    await expect(page.getByText(`state/INBOX.md#${approval}`, { exact: true })).toBeVisible();
  }

  await page.goto("/admin?view=manual-tasks", { waitUntil: "networkidle" });
  for (const task of [
    "Sign or decline BH-RESEARCH-001",
    "Approve Door Money's private source (BOOK-SOURCE-001)",
    "Sign or decline TS-RESEARCH-004",
    "Approve Kvórum's one-page Apify scope"
  ]) {
    await expect(page.getByText(task, { exact: false }).first()).toBeVisible();
  }
});

test("Tehdejsi svet unreadable records count on the venture and company views", async ({ page }) => {
  await writeFile(tsUnreadablePath, "{}\n");
  try {
    await page.goto("/admin?venture=global", { waitUntil: "networkidle" });
    const unreadable = page.locator("[data-adm-rail-foot]").getByText("Unreadable files", { exact: true }).locator("..");
    await expect(unreadable.getByText("1", { exact: true })).toBeVisible();

    await page.goto("/admin?venture=tehdejsi-svet&tab=features", { waitUntil: "networkidle" });
    await expect(page.getByText(/1 saved file cannot be read: features \(1\)/u)).toBeVisible();
  } finally {
    await rm(tsUnreadablePath, { force: true });
  }
});

test("WeekBoard navigates between statically generated weeks", async ({ page }) => {
  // The five-day board is /calendar's product now. The home page walks past a calendar of its
  // own — a full week, stepped in place — and this test is about the linked, statically
  // generated weeks, which only /calendar has.
  // Start with the saved operating week. Historical windows are rebuilt against the current
  // clock, so a slot that was future when the feed was committed is now truthfully held, skipped
  // or missed. The previous generated week carries the missed state this test also verifies.
  await page.goto("/calendar/2026-08-03", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-scroll-behavior",
    "smooth"
  );
  const weekBoard = page.getByTestId("week-board");
  await expect(weekBoard).toBeVisible();
  // One row per calendar slot, and the registry decides how many slots there are. Pinning the
  // number made this guard break every time a venture opened or closed; what it protects is that
  // every registered slot renders exactly one row and one project icon.
  await expect(weekBoard.locator(".contents")).toHaveCount(CALENDAR_SLOTS.length);
  await expect(weekBoard.locator("[data-project-icon]")).toHaveCount(CALENDAR_SLOTS.length);
  // The legend owns one entry per colour currently represented by the calendar model. Keep the
  // count aligned with that model as ventures join instead of preserving the old ten-entry pin.
  await expect(page.locator("[data-project-legend]")).toHaveCount(12);
  for (const [kind, hour, project] of [
    ["bh-desk", "12", "booksofhistory"],
    ["dm-desk", "15", "door-money"],
    ["dm-growth", "16", "door-money"],
    ["ts-desk", "18", "tehdejsi-svet"],
    ["kv-desk", "21", "kvorum"]
  ] as const) {
    const row = weekBoard.locator(`[data-calendar-kind="${kind}"][data-calendar-hour="${hour}"]`);
    await expect(row).toHaveCount(1);
    await expect(row.locator(`[data-calendar-slot][data-project="${project}"]`)).toHaveCount(5);
  }
  await expect(weekBoard.locator("[data-calendar-slot] time")).toHaveCount(0);
  // No assertion that a fixture is on the board. There were test meetings on it when the archive
  // was young; there are none now, and requiring one would be requiring the company to keep
  // sample data in a public week.
  await expect(weekBoard.locator('[data-calendar-state="held"]')).not.toHaveCount(0);
  const previous = page.getByRole("link", { name: "Previous calendar week" });
  await expect(previous).toHaveAttribute("href", /\/calendar\/\d{4}-\d{2}-\d{2}/);
  await previous.click();
  await expect(weekBoard.locator('[data-calendar-state="missed"]')).not.toHaveCount(0);
  const next = page.getByRole("link", { name: "Next calendar week" });
  await expect(next).toHaveAttribute("href", /\/calendar\/\d{4}-\d{2}-\d{2}/);
  await next.click();
  await expect(page).toHaveURL(/\/calendar\/\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByTestId("week-board")).toBeVisible();
  await expect(page.getByRole("link", { name: "Previous calendar week" })).toBeVisible();
});

test("every agent card and profile exposes its configured API model and estimated call cost", async ({ page }) => {
  await page.goto("/agents", { waitUntil: "networkidle" });
  // The roster was cut and /agents counts the roles that work, not the ones that ever existed.
  // Asserting "every card carries a model and a cost" is the point; asserting a headcount the
  // page deliberately no longer shows is not.
  const agentCards = await page.locator("[data-agent-api-model]").count();
  expect(agentCards).toBeGreaterThan(0);
  await expect(page.locator("[data-agent-api-cost-summary]")).toHaveCount(agentCards);
  await expect(page.getByText("OpenAI · GPT-5.6 Luna").first()).toBeVisible();
  await expect(page.getByText("Anthropic · Claude Haiku 4.5").first()).toBeVisible();

  await page.goto("/agents/hacek", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Model calls" })).toBeVisible();
  // Which model a role runs, and which rooms it runs in, are config: both moved when HACEK's
  // routes were retuned. The page's job is to disclose whatever is configured, so the assertion
  // is that a named provider, a model and a per-run cost are all on the page — not which ones.
  await expect(page.locator("[data-agent-api-routes]")).toContainText(/OpenAI|Anthropic/);
  await expect(page.locator("[data-agent-api-routes]")).toContainText("Approx. cost per live run");
  // A priced call, in dollars. The cheapest is $0.004 now and was over a cent when this was
  // written, so the pattern asserts that a real price is printed rather than how large it is.
  await expect(page.locator("[data-agent-api-cost]").first()).toHaveText(/^\$\d+\.\d+$/);
});

test("public presentation keeps approved agent photos and plain calendar labels", async ({ page }) => {
  await page.goto("/agents", { waitUntil: "networkidle" });
  await expect(page.getByText("The AI team", { exact: true })).toBeVisible();
  await expect(page.getByText("The cast", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "VIZE", exact: true })).toBeVisible();
  await expect(page.locator('img[src*="vize.webp"]').first()).toBeVisible();
  await expect(page.locator("[data-show-presentation]")).toHaveCount(0);

  await page.goto("/agents/vize", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "VIZE" })).toBeVisible();
  await expect(page.getByText("Strategy lead", { exact: true })).toBeVisible();

  await page.goto("/", { waitUntil: "networkidle" });
  const weekBoard = page.getByTestId("week-board");
  await expect(weekBoard.getByText(/Season|Episode/)).toHaveCount(0);
  await expect(page.locator("[data-show-presentation]")).toHaveCount(0);
});

test("the enlarged roster names every new role and discloses each allowed profile assignment", async ({ page }) => {
  await page.goto("/agents", { waitUntil: "networkidle" });
  await expect(page.getByText("40", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("FOLIO · Book selection editor", { exact: true })).toBeVisible();
  await expect(page.getByText("PLOT · Book story producer", { exact: true })).toBeVisible();

  for (const [slug, id, assignment] of [
    ["tribun", "TRIBUN", "Kvórum"],
    ["ghost", "GHOST", "Door Money"],
    ["booker", "BOOKER", "Door Money"],
    ["letopis", "LETOPIS", "Tehdejší svět"],
    ["verba", "VERBA", "Tehdejší svět"]
  ] as const) {
    await page.goto(`/agents/${slug}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: id })).toBeVisible();
    await expect(page.locator("[data-agent-ventures]")).toHaveText(assignment);
    await expect(page.getByText(`${id} uses a neutral name tile until the owner approves a portrait.`)).toBeVisible();
  }

  await page.goto("/agents/hacek", { waitUntil: "networkidle" });
  await expect(page.locator("[data-agent-ventures]")).toHaveText("DNESKAi · MMA Files · Kvórum · BOOKSOFHISTORY · Tehdejší svět");
  await page.goto("/agents/quill", { waitUntil: "networkidle" });
  await expect(page.locator("[data-agent-ventures]")).toHaveText("Every venture");
});

test("Carousel Studio serves and displays its preview images", async ({ page, request }) => {
  const response = await request.get(
    "/api/carousel-studio/preview/cover-cta/1.0.0/caught-up/instagram-square/1"
  );
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toBe("image/svg+xml; charset=utf-8");
  expect((await response.text()).startsWith("<svg ")).toBe(true);

  await page.goto("/ventures/carousel-studio", { waitUntil: "networkidle" });
  const preview = page.locator("[data-carousel-preview]").first();
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toBeVisible();
  await expect.poll(async () => preview.evaluate((image: HTMLImageElement) => ({
    complete: image.complete,
    height: image.naturalHeight,
    width: image.naturalWidth
  }))).toEqual({ complete: true, height: 1080, width: 1080 });
});

test("measures role column keeps the table inset", async ({ page }) => {
  // /metrics is a section of /results now, and the table there takes its inset from the section
  // rather than from its own first cell — `first:pl-0`. What the rule was ever protecting is that
  // the column does not hug the viewport edge and that the head and the cell stay aligned, so
  // that is what is asserted, against the page the table actually lives on.
  await page.goto("/results", { waitUntil: "networkidle" });
  const roleHead = page.getByRole("columnheader", { name: "Role" }).first();
  await roleHead.scrollIntoViewIfNeeded();
  const firstRole = page.locator("tbody tr").first().getByRole("cell").first();
  const headBox = await roleHead.boundingBox();
  const cellBox = await firstRole.boundingBox();
  expect(headBox?.x ?? 0).toBeGreaterThan(0);
  expect(Math.abs((headBox?.x ?? 0) - (cellBox?.x ?? 0))).toBeLessThanOrEqual(1);
});

test("Money reports attributed venture costs without filling evidence gaps", async ({ page }) => {
  await page.goto("/results#money", { waitUntil: "networkidle" });
  const costs = page.locator("[data-venture-costs]");
  await costs.scrollIntoViewIfNeeded();
  await expect(costs).toBeVisible();
  for (const venture of ["BOOKSOFHISTORY", "Door Money", "Tehdejší svět", "Kvórum"]) {
    await expect(costs.getByText(venture, { exact: true })).toBeVisible();
  }
  await expect(costs.getByText("Recorded Apify allocation estimate; shared-account actual is unavailable.")).toBeVisible();
  await expect(costs.getByText("No data", { exact: true })).not.toHaveCount(0);
});

test("MMA Files article heroes load from the package-backed archive", async ({ page }) => {
  await page.goto("/admin?venture=mma-files&tab=articles", { waitUntil: "networkidle" });
  const heroes = page.locator("main figure img");
  await expect.poll(() => heroes.count()).toBeGreaterThan(0);
  for (let index = 0; index < await heroes.count(); index += 1) {
    await heroes.nth(index).scrollIntoViewIfNeeded();
    await expect
      .poll(() => heroes.nth(index).evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
  }
});

test("marketingShark packages tab shows stored package cards", async ({ page }) => {
  await page.goto("/admin?venture=marketingshark&tab=packages", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "e2e-fixture · 2026-08-09" })).toBeVisible();
  await expect(page.getByText("staged/e2e-package.json")).toBeVisible();
});

test("DNESKAi social archive renders its Czech-only packs", async ({ page }) => {
  await page.goto("/admin?venture=global", { waitUntil: "networkidle" });
  const archive = page.locator("#social-archive");
  await expect(archive.getByRole("heading", { name: "CS social posts" })).toHaveCount(2);
  await expect(archive.getByText("English edition")).toHaveCount(0);
  await expect(archive.getByText(/social post files cannot be read/)).toHaveCount(0);
  const frames = archive.locator("img");
  await expect(frames).toHaveCount(20);
  for (const index of [0, 10]) {
    await frames.nth(index).scrollIntoViewIfNeeded();
    await expect.poll(() => frames.nth(index).evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  }
});

test("FightAIQ hides reports until an analysis run produces them", async ({ page }) => {
  await page.goto("/admin?venture=fightaiq", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "fight reports" })).toHaveCount(0);
  await expect(page.getByText("No ten-fight report is stored.")).toHaveCount(0);
});

test("admin makes its deployment write capability explicit", async ({ page }) => {
  await page.goto("/admin?venture=global", { waitUntil: "networkidle" });
  const readOnly = Boolean(process.env.VERCEL) && !process.env.BOARDLESSAI_GITHUB_TOKEN;
  const warning = page.getByText("Read-only deployment — saving needs the GitHub token, see NEEDED.md.");
  const addCost = page.getByRole("button", { name: "Add cost" });

  if (readOnly) {
    await expect(warning).toBeVisible();
    await expect(addCost).toBeDisabled();
  } else {
    await expect(warning).toHaveCount(0);
    await expect(addCost).toBeEnabled();
  }
});

test("admin separates pending approvals from approved deliveries still waiting", async ({ page }) => {
  await page.goto("/admin?venture=global", { waitUntil: "networkidle" });
  const attention = page.locator("[data-adm-rail-foot]");
  await expect(attention).toContainText("Approvals waiting");
  await expect(attention).toContainText("Approved deliveries waiting");
  await expect(attention).toContainText("1");
});

test("BOOKSOFHISTORY admin tabs expose recorded evidence without rendering a book cover", async ({ page }) => {
  await page.goto("/admin?venture=booksofhistory&tab=shortlist", { waitUntil: "networkidle" });
  await expect(page.getByText("Today’s shortlist", { exact: true })).toBeVisible();
  await expect(page.getByText("Válka s mloky").first()).toBeVisible();
  await expect(page.getByText("Editorial priors")).toBeVisible();

  await page.goto("/admin?venture=booksofhistory&tab=dossiers", { waitUntil: "networkidle" });
  await expect(page.getByText("Knowledge shelf", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Archive catalogue", exact: true })).toBeVisible();
  await expect(page.getByText("Research ledger", { exact: true })).toBeVisible();

  await page.goto("/admin?venture=booksofhistory&tab=features", { waitUntil: "networkidle" });
  const feature = page.locator('[data-bh-feature="rec-e2e-admin-feature"]');
  await expect(feature.getByRole("heading", { name: "Czech package" })).toBeVisible();
  await expect(feature.getByRole("heading", { name: "English package" })).toBeVisible();
  await expect(feature.getByText("CS passed")).toBeVisible();
  await expect(feature.getByText("Your rating")).toBeVisible();
  await expect(feature.locator("img")).toHaveCount(0);
});

// The rated object used to be a niche proposal, and the assertion after the reload used to be
// the incubator shortlist. Both left with the venture; what the test is actually for — a rating
// survives the round trip to the ledger and comes back as history — is unchanged, so it now runs
// on the plan card the binder assertion below already needs.
/*
 * These journeys run in their own Playwright project. They get a separate browser process from
 * the long read-only audit, while Playwright's page fixture gives each test a fresh context.
 * A failed write or cleared cookie cannot leak into the next journey, and no retry masks a fault.
 */
test.describe("admin journeys that write", { tag: "@write-journey" }, () => {

  test("all four new venture RatingWidgets append and reload permanent history", async ({ page }) => {
    const dmRecommendationPath = path.join(repositoryRoot, "state/ventures/door-money/recommendations/e2e-rating.json");
    let original: string | null = null;
    try {
      try { original = await readFile(dmRecommendationPath, "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await mkdir(path.dirname(dmRecommendationPath), { recursive: true });
      const dmRecommendation = JSON.parse(await readFile(
        path.join(repositoryRoot, "contracts/fixtures/venture-recommendation.valid.json"),
        "utf8"
      )) as Record<string, unknown>;
      dmRecommendation.id = "e2e-rating";
      await writeFile(dmRecommendationPath, `${JSON.stringify(dmRecommendation, null, 2)}\n`);

      for (const route of [
        "/admin?venture=booksofhistory&tab=features",
        "/admin?venture=door-money&tab=recommendations",
        "/admin?venture=tehdejsi-svet&tab=features",
        "/admin?venture=kvorum&tab=recommendations"
      ]) {
        await page.goto(route, { waitUntil: "networkidle" });
        const rating = page.getByRole("group", { name: "Your rating" }).first();
        await rating.getByRole("button", { name: "Good", exact: true }).click();
        await expect(page.getByText("Rating saved to the permanent history.").first()).toBeVisible({ timeout: 60_000 });
        await page.reload({ waitUntil: "networkidle" });
        await expect(page.getByRole("group", { name: "Your rating" }).first()
          .getByRole("button", { name: "Good", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByText("Rating history (1)").first()).toBeVisible();
      }
    } finally {
      if (original === null) await rm(dmRecommendationPath, { force: true });
      else await writeFile(dmRecommendationPath, original);
    }
  });

  test("Tehdejsi svet result entry stays manual and approval-gated", async ({ page }) => {
    let resultPosts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/admin/api/tehdejsi-svet/results") resultPosts += 1;
    });
    await page.goto("/admin?venture=tehdejsi-svet&tab=features", { waitUntil: "networkidle" });
    const lane = page.locator('[data-tehdejsi-results="cs"]');
    await lane.getByLabel("Metrics captured at").fill("2026-08-12T13:00");
    await lane.getByLabel("Sends (primary)").fill("18");
    const response = page.waitForResponse((candidate) =>
      candidate.request().method() === "POST" && new URL(candidate.url()).pathname === "/admin/api/tehdejsi-svet/results"
    );
    await lane.getByRole("button", { name: "Record manual result" }).click();
    expect((await response).status()).toBe(409);
    await expect(lane.getByRole("alert")).toContainText("TS-RESULTS-005 is pending");
    expect(resultPosts).toBe(1);
  });

  test("Tehdejsi svet keeps owner paste-in behind its approval", async ({ page }) => {
    let futurePosts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/admin\/api\/tehdejsi-svet\/(?:signals|insights|results)$/u.test(new URL(request.url()).pathname)) futurePosts += 1;
    });
    await page.goto("/admin?venture=tehdejsi-svet&tab=signals", { waitUntil: "networkidle" });
    const panel = page.locator("[data-tehdejsi-signals]");
    await expect(panel.getByText("No owner-pasted community memory is recorded.")).toBeVisible();
    const sourceLabel = panel.getByLabel("Source label");
    const comments = panel.getByLabel("Owner-pasted comments");
    const record = panel.getByRole("button", { name: "Record recollections" });
    await expect.poll(async () => {
      await sourceLabel.fill("Synthetic e2e owner paste");
      await comments.fill("[theme: fictional memory] A synthetic recollection.");
      return record.isEnabled();
    }, { timeout: 30_000 }).toBe(true);
    await record.click();
    await expect(panel.getByRole("alert")).toContainText("TS-RESULTS-005 is pending");
    expect(futurePosts).toBe(1);
  });

  test("BOOKSOFHISTORY owner approval records both Design Lab handoffs without posting", async ({ page }) => {
    await page.goto("/admin?venture=booksofhistory&tab=features", { waitUntil: "networkidle" });
    const feature = page.locator('[data-bh-feature="rec-e2e-admin-feature"]');
    const response = page.waitForResponse((candidate) => candidate.url().endsWith("/admin/api/booksofhistory/features") && candidate.request().method() === "POST");
    await feature.getByRole("button", { name: "Approve both languages" }).click();
    expect((await response).status()).toBe(201);
    await expect(feature.getByText("approved", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(feature.getByRole("link", { name: "Open both locale records in Design Lab →" })).toBeVisible();
    await expect(feature.getByRole("button", { name: "Record owner-posted URL" })).toHaveCount(2);
    await expect(feature.getByText("attached results")).toHaveCount(2);
  });

  test("Door Money records a synthetic owner completion through the canonical route", async ({ page }) => {
    const actionPath = path.join(repositoryRoot, "state", "ventures", "door-money", "actions", "2026-08-06.json");
    const fixturePath = path.join(repositoryRoot, "contracts", "fixtures", "action-packet.valid.json");
    let original: string | null = null;
    try { original = await readFile(actionPath, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    let actionPosts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/admin/api/door-money/actions")) actionPosts += 1;
    });
    try {
      await mkdir(path.dirname(actionPath), { recursive: true });
      const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as {
        id: string;
        date: string;
        weekOf: string;
        agenda: { isoWeek: string };
        tasks: Array<{ completion: { completedAt: string } | null }>;
        generatedAt: string;
        updatedAt: string;
      };
      fixture.id = "action-packet-2026-08-06";
      fixture.date = "2026-08-06";
      fixture.weekOf = "2026-08-03";
      fixture.agenda.isoWeek = "2026-W32";
      fixture.generatedAt = "2026-08-06T14:00:00.000Z";
      fixture.updatedAt = "2026-08-06T17:00:00.000Z";
      const completed = fixture.tasks.find(({ completion }) => completion !== null)?.completion;
      if (completed) completed.completedAt = "2026-08-06T17:00:00.000Z";
      await writeFile(actionPath, `${JSON.stringify(fixture, null, 2)}\n`);
      await page.goto("/admin?venture=door-money&tab=actions", { waitUntil: "networkidle" });

      const task = page.getByRole("heading", { name: "Review the fictional launch note" }).locator("xpath=ancestor::li[1]");
      const outcome = task.getByLabel("Outcome (required)");
      const complete = task.getByRole("button", { name: "Mark complete" });
      // A warm Next dev server can paint this controlled field just before hydration attaches its
      // change handler. Refill until the app's own validation enables submit; this waits on user-
      // visible state instead of sleeping or clicking a disabled server-rendered button.
      await expect.poll(async () => {
        await outcome.fill("The synthetic owner reviewed the fictional note.");
        return complete.isEnabled();
      }, { timeout: 30_000 }).toBe(true);
      await complete.click();
      await expect(task.getByText("Outcome recorded. The weekly room can now read this completion.")).toBeVisible();
      expect(actionPosts).toBe(1);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByText("Outcome: The synthetic owner reviewed the fictional note.")).toBeVisible();
    } finally {
      if (original === null) await rm(actionPath, { force: true });
      else await writeFile(actionPath, original);
    }
  });

  test("Kvórum approval queues a renderable Design Lab deck without publishing", async ({ page, request }) => {
    await page.goto("/admin?venture=kvorum&tab=recommendations", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Poplatky se vracejí do Sněmovny" })).toBeVisible();
    await page.getByRole("button", { name: "Approve as drafted" }).click();
    await expect(page.getByText("Approved and queued in the Design Lab. Nothing was published.")).toBeVisible({ timeout: 60_000 });

    await page.goto("/admin?venture=carousel-studio&tab=studio&brand=kvorum", { waitUntil: "networkidle" });
    const railCard = page.locator("[data-article-rail] button")
      .filter({ hasText: "Kvórum" })
      .filter({ hasText: "Poplatky se vracejí do Sněmovny" })
      .first();
    await expect(railCard).toBeVisible();
    await railCard.click();
    await expect(railCard).toHaveAttribute("aria-pressed", "true");

    const slideHref = await page.getByRole("link", { name: "Stáhnout slide" }).getAttribute("href");
    expect(slideHref).toBeTruthy();
    const slide = await request.get(new URL(slideHref!, page.url()).toString());
    expect(slide.ok()).toBe(true);
    expect(slide.headers()["content-type"]).toBe("image/png");
    expect((await slide.body()).byteLength).toBeGreaterThan(1_000);

    const deckHref = await page.getByRole("link", { name: "Stáhnout celý deck" }).getAttribute("href");
    expect(deckHref).toBeTruthy();
    const deck = await request.get(new URL(deckHref!, page.url()).toString());
    expect(deck.ok()).toBe(true);
    expect(deck.headers()["content-type"]).toBe("application/zip");
    expect((await deck.body()).byteLength).toBeGreaterThan(1_000);

    await page.goto("/admin?venture=kvorum&tab=recommendations", { waitUntil: "networkidle" });
    const postedUrl = page.getByLabel("Manually posted HTTPS URL");
    const recordPostedUrl = page.getByRole("button", { name: "Record posted URL" });
    await expect.poll(async () => {
      await postedUrl.fill("https://example.com/manual-kvorum-post");
      return recordPostedUrl.isEnabled();
    }, { timeout: 30_000 }).toBe(true);
    await recordPostedUrl.click();
    await expect(page.getByText("The manual post URL is recorded. No metrics were fetched.")).toBeVisible({ timeout: 60_000 });

    await page.goto("/admin?venture=kvorum&tab=claims", { waitUntil: "networkidle" });
    await expect(page.getByText("3 on this tab", { exact: true })).toBeVisible();
    const publishedClaim = page.locator("article")
      .filter({ hasText: "Návrh se vrací do sněmovního projednávání." })
      .first();
    await expect(publishedClaim.getByText("manual post recorded", { exact: true })).toBeVisible();
    await publishedClaim.getByRole("button", { name: "Draft correction" }).click();
    await expect(publishedClaim.getByText("A new correction recommendation is waiting for owner review. Nothing was published."))
      .toBeVisible({ timeout: 60_000 });

    await page.goto("/admin?venture=kvorum&tab=recommendations", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /Oprava: Návrh se vrací do sněmovního projednávání/u })).toBeVisible();
  });

  test("admin ideas retain their saved rating and graduation after reload", async ({ page }) => {
    await page.goto("/admin?venture=titty-tuesdays&tab=ideas", { waitUntil: "networkidle" });
    const card = page.getByRole("heading", { name: "Night Shift — One Good Day" }).locator("..");
    await expect(card.getByText("Rated perfect — graduated")).toBeVisible();
    await expect(card.getByText("Saved rating: perfect")).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(card.getByText("Rated perfect — graduated")).toBeVisible();
    await expect(card.getByText("Saved rating: perfect")).toBeVisible();
  });

  test("admin rating persists and the launch binder renders", async ({ page }) => {
    await page.goto("/admin?venture=titty-tuesdays&tab=plans", { waitUntil: "networkidle" });
    const e2eCard = page.getByRole("heading", { name: "E2E launch binder plan" }).locator("xpath=../..");
    await expect(e2eCard).toBeVisible();
    await expect(e2eCard.getByText("staged/e2e-launch.json")).toBeVisible();
    await e2eCard.getByLabel("Note (optional)").fill("E2E owner note");
    await e2eCard.getByRole("button", { name: "Perfect", exact: true }).click();
    // The confirmation appears only after `POST /admin/api/ratings` has appended to the ledger on
    // disk, and that round trip runs past the 5s an expectation gets by default — which is why this
    // has been the suite's most reliable false negative, failing on the clock rather than on the
    // app. Measured: it passes in about 35 seconds.
    await expect(page.getByText("Rating saved to the permanent history.")).toBeVisible({ timeout: 60_000 });
    await page.reload({ waitUntil: "networkidle" });
    await expect(e2eCard.getByText("Rating history (1)")).toBeVisible({ timeout: 30_000 });

    await page.goto("/admin/ventures/titty-tuesdays/binder", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Titty Tuesdays" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "E2E launch binder plan" })).toBeVisible();
    await expect(page.getByText(/^\d+ ready plans$/)).toBeVisible();
  });

  test("admin login explains errors, starts a session and signs out", async ({ page }) => {
    const expectLoginError = async (error: "expired" | "invalid") => {
      await expect.poll(() => {
        const url = new URL(page.url());
        return {
          pathname: url.pathname,
          error: url.searchParams.get("error"),
          returnTo: url.searchParams.get("returnTo")
        };
      }).toEqual({ pathname: "/admin/login", error, returnTo: "/admin" });
    };

    await page.context().clearCookies();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin", { waitUntil: "networkidle" });
    await expectLoginError("expired");
    await expect(page.getByRole("heading", { name: "Your project desk." })).toBeVisible();
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);

    await page.getByLabel("Username").fill("e2e-owner");
    const password = page.locator('input[name="password"]');
    await password.fill("wrong");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Open project desk" }).click();
    await expectLoginError("invalid");
    await expect(page.getByText("Those details did not match")).toBeVisible();

    await page.getByLabel("Username").fill("e2e-owner");
    await page.locator('input[name="password"]').fill("e2e-password");
    await page.getByRole("button", { name: "Open project desk" }).click();
    await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Project desk." })).toBeVisible();
    // The "Updated at" tile went with the redesign: the page is force-dynamic and behind a
    // credential check, so a rendered-at timestamp told the owner only that the page had rendered.
    // What is worth asserting is that the protected shell came up — breadcrumb, state badge and the
    // way back out.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login\?error=expired(?:&returnTo=%2Fadmin)?$/);
  });
});

const responsiveRoutes = ["/", "/agents", "/agents/hacek", "/calendar/2026-07-27", "/ventures/titty-tuesdays", "/ventures/fightaiq", "/ventures/carousel-studio", "/ventures/booksofhistory", "/ventures/door-money", "/ventures/kvorum", "/ventures/tehdejsi-svet", "/money", "/admin?venture=global", "/admin?venture=door-money&tab=recommendations", "/admin?venture=door-money&tab=actions", "/admin?venture=door-money&tab=knowledge", "/admin?venture=titty-tuesdays&tab=plans", "/admin?venture=fightaiq&tab=events", "/admin?venture=mma-files&tab=social-lab", "/admin?venture=booksofhistory&tab=features", "/admin?venture=tehdejsi-svet&tab=features", "/admin?venture=tehdejsi-svet&tab=library", "/admin?venture=tehdejsi-svet&tab=signals", "/admin?venture=carousel-studio&tab=studio"];

for (const mode of [
  { name: "mobile", width: 375, height: 812, colorScheme: "dark" as const, reducedMotion: "no-preference" as const },
  { name: "landscape", width: 844, height: 390, colorScheme: "dark" as const, reducedMotion: "no-preference" as const },
  { name: "reduced motion", width: 1440, height: 900, colorScheme: "dark" as const, reducedMotion: "reduce" as const }
]) {
  for (const route of responsiveRoutes) {
    test(`portfolio surface remains contained in ${mode.name} — ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: mode.width, height: mode.height });
      await page.emulateMedia({ colorScheme: mode.colorScheme, reducedMotion: mode.reducedMotion });
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("main")).toBeVisible();
      const viewport = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
          offenders: Array.from(document.querySelectorAll("body *"))
            .filter((element) => {
              if (element.closest("[data-horizontal-scroll], [data-viewport-decoration]")) return false;
              const bounds = element.getBoundingClientRect();
              return bounds.left < -1 || bounds.right > document.documentElement.clientWidth + 1;
            })
          .slice(0, 6)
          .map((element) => ({
            className: element.getAttribute("class"),
            tag: element.tagName.toLowerCase(),
            text: element.textContent?.trim().slice(0, 80)
          }))
      }));
      expect(viewport.offenders, `${route} has content outside its ${viewport.clientWidth}px viewport`).toEqual([]);
    });
  }
}

/**
 * The wallboard and the reports view share one measured rect on the photograph.
 *
 * The rect is mapped to the dark screen of the office picture, so the reports view cannot grow the
 * screen to fit — it has to fit the screen. Checked at the three widths the design is drawn for,
 * and the no-scrollbar assertion is the one that matters: a screen on a wall that scrolls is a
 * browser window.
 */
for (const size of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 812 }
]) {
  test(`the office TV swaps to reports inside its own frame at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/", { waitUntil: "networkidle" });

    // The walkthrough snaps between sections, so the way to reach the TV is its own nav — the
    // same way a reader does it. `scrollIntoViewIfNeeded` lands beside the section, not on it.
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    const screen = page.locator("[data-tv]");
    await expect(screen).toContainText("Results · this month", { timeout: 15_000 });

    /*
     * Dispatched, not driven.
     *
     * The screen is drawn inside a parallaxed plate under scroll-snap. Playwright reports
     * intersection ratio 0 for controls on it and refuses to click even with `force`, while
     * `getBoundingClientRect` puts the same button at top 574 in an 800px viewport — so the
     * refusal is about the harness's model of the plate, not about reachability. What has to be
     * true is that the handler runs and the result fits the frame, and both are checked directly.
     */
    await screen.locator("[data-tv-reports]").evaluate((element: HTMLElement) => element.click());
    await expect(screen).toContainText("Latest day");
    await expect(screen).not.toContainText("Results · this month");

    // Nothing inside the screen scrolls, nothing spills out of it, and the controls sit on it.
    const fit = await screen.evaluate((element) => {
      const body = element.firstElementChild as HTMLElement;
      const outer = element.getBoundingClientRect();
      const inner = body.getBoundingClientRect();
      const back = element.querySelector("[data-k=\"btn\"]")!.getBoundingClientRect();
      return {
        overflowY: body.scrollHeight - body.clientHeight,
        overflowX: body.scrollWidth - body.clientWidth,
        spillsBottom: Math.round(inner.bottom - outer.bottom),
        spillsRight: Math.round(inner.right - outer.right),
        controlInsideScreen: back.bottom <= outer.bottom + 1 && back.right <= outer.right + 1,
        screenHasArea: outer.width > 0 && outer.height > 0
      };
    });
    expect(fit.screenHasArea).toBe(true);
    expect(fit.overflowY, "the reports view scrolls vertically inside the screen").toBeLessThanOrEqual(1);
    expect(fit.overflowX, "the reports view scrolls horizontally inside the screen").toBeLessThanOrEqual(1);
    expect(fit.spillsBottom).toBeLessThanOrEqual(1);
    expect(fit.spillsRight).toBeLessThanOrEqual(1);
    expect(fit.controlInsideScreen, "a control sits outside the TV frame").toBe(true);

    // The only control the reports view has is the way back, so it is the first button on the bar.
    await screen.locator("[data-k=\"btn\"]").first().evaluate((element: HTMLElement) => element.click());
    await expect(screen).toContainText("Results · this month");
  });
}

/**
 * Company files is the page the owner reads first, and the one they understood least.
 *
 * "There are many things that I don't even understand what they mean." These are the words that
 * were on it: contract tokens the runtime uses internally, the agents' codenames, and engineering
 * vocabulary for gates and rates. None of them belong on a page whose job is to answer four
 * questions — what did it cost, what needs me, what shipped, what is waiting.
 */
test("Company files speaks plainly", async ({ page }) => {
  await page.goto("/admin?venture=global", { waitUntil: "networkidle" });
  const pageText = await page.locator("main").innerText();
  // The social-archive panel intentionally uses platform names such as Threads and Instagram;
  // this guard covers Company files itself and stops at that separately tested surface.
  const body = pageText.split("Social drafts · DNESKAi", 1)[0] ?? pageText;

  const jargon = [
    "NO_EDITION",
    "Fail closed",
    "activation threshold",
    "health gate",
    "Model share",
    "Owner writes · signed",
    "seats returned a position",
    "verifierPassRate",
    "METRICS_INGESTION_ENABLED"
  ];
  for (const phrase of jargon) {
    expect(body, `Company files still says "${phrase}"`).not.toContain(phrase);
  }

  // Agent codenames are how the runtime addresses itself, not how a person reads a page. Threads
  // and Instagram are also legitimate channel names in the social archive, so they are not
  // evidence that the matching internal agents leaked into owner-facing copy.
  for (const codename of ["FRAME", "SCRIBE", "HERALD"]) {
    expect(body, `Company files still shows the codename ${codename}`).not.toContain(codename);
  }

  // And the venture ids, which the rest of the admin already renders as display names.
  expect(body).not.toContain("caught up");
  expect(body).not.toMatch(/\bcarousel-studio\b/);
});

test("stateful route controls preserve page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/ideas", { waitUntil: "networkidle" });
  const accepted = page.getByRole("link", { name: "Approved", exact: true });
  await accepted.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 200));
  const ideasScrollY = await page.evaluate(() => window.scrollY);
  expect(ideasScrollY).toBeGreaterThan(0);
  await accepted.click();
  await expect(page).toHaveURL(/\/ideas\?status=accepted$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(ideasScrollY);

  // The week arrows moved with the board they belong to. The home page is now a walkthrough
  // whose calendar steps weeks in place, without navigating; the linked arrows — and therefore
  // the scroll-preservation guarantee this test exists to hold — live on /calendar, which
  // redirects to the week the reader is in.
  await page.goto("/calendar", { waitUntil: "networkidle" });
  const nextWeek = page.getByRole("link", { name: "Next calendar week" });
  await nextWeek.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 200));
  const nextScrollY = await page.evaluate(() => window.scrollY);
  expect(nextScrollY).toBeGreaterThan(0);
  await nextWeek.click();
  await expect(page).toHaveURL(/\/calendar\/\d{4}-\d{2}-\d{2}$/);
  const expectedNextScrollY = await page.evaluate(
    (requested) =>
      Math.min(requested, document.documentElement.scrollHeight - window.innerHeight),
    nextScrollY
  );
  expect(expectedNextScrollY).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(expectedNextScrollY);

  const previousWeek = page.getByRole("link", { name: "Previous calendar week" });
  await previousWeek.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 200));
  const previousScrollY = await page.evaluate(() => window.scrollY);
  expect(previousScrollY).toBeGreaterThan(0);
  await previousWeek.click();
  const expectedPreviousScrollY = await page.evaluate(
    (requested) =>
      Math.min(requested, document.documentElement.scrollHeight - window.innerHeight),
    previousScrollY
  );
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(expectedPreviousScrollY);
});

test("Decision Replay controls preserve page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/standups/2026-07-23-founding/room", {
    waitUntil: "networkidle"
  });
  await page
    .getByRole("button", { name: "Start chat replay" })
    .click();

  const nextTurn = page.getByRole("button", { name: "Next message" });
  await nextTurn.scrollIntoViewIfNeeded();
  const nextScrollY = await page.evaluate(() => window.scrollY);
  expect(nextScrollY).toBeGreaterThan(0);
  await nextTurn.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(nextScrollY);

  const previousTurn = page.getByRole("button", { name: "Previous message" });
  const previousScrollY = await page.evaluate(() => window.scrollY);
  await previousTurn.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(previousScrollY);
});

// The Council Simulator was removed with the /boardroom page that showed it, so the scroll
// guarantee it checked has no control left to check. /ideas and /calendar above still cover it.

for (const [route, heading] of [
  ["/meetings/2026-07-30-cu-edition", "Produce today"],
  ["/meetings/2026-07-30-cu-product", "Decide the product idea"],
  ["/meetings/2026-08-01-mma-intake", "Check the fight data"],
  ["/meetings/2026-08-01-mma-analysis", "Review the model without guessing"],
  ["/meetings/2026-08-01-mag-editorial", "Choose or reject both article slots"],
  ["/meetings/2026-08-01-mag-desk", "Check today’s articles and social drafts"],
  ["/meetings/2026-08-01-studio", "Review the work."]
] as const) {
  test(`renders the new room kind at ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: new RegExp(heading) })).toBeVisible();
    await expect(page.getByText("Every saved message")).toBeVisible();
    await expect(page.locator("ol li").first()).toBeVisible();
  });
}

/*
 * The opened room stands on the stage, whole and readable.
 *
 * This guard exists because the framing arithmetic once let the container's aspect decide the
 * framing on its own: an opened room took a third of the stage's width and 87% of its height,
 * its neighbours filled the rest at four times their drawn scale, and on the narrow rooms the
 * content ran sideways out of the drawing entirely. Every assertion below is one of those
 * symptoms, measured rather than eyeballed.
 */
const OPENABLE_ROOMS = [
  "company",
  "caught-up",
  "mma-files",
  "fightaiq",
  "carousel-studio",
  "marketingshark",
  "goviral",
  "titty-tuesdays",
  "booksofhistory",
  "door-money",
  "tehdejsi-svet",
  "kvorum"
] as const;

test("the home walkthrough carries all eleven ventures at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });

  const ventures = [
    "DNESKAi",
    "Titty Tuesdays",
    "GoVIRAL",
    "BOOKSOFHISTORY",
    "FightAIQ",
    "Design Lab",
    "marketingShark",
    "MMA Files",
    "Door Money",
    "Tehdejší svět",
    "Kvórum"
  ];
  await expect(page.locator("[data-proj-card]")).toHaveCount(11);
  for (const venture of ventures) {
    await expect(page.locator("[data-proj-card]", { hasText: venture })).toHaveCount(1);
  }
  await expect(page.locator("[data-chat-list] button")).toHaveCount(12);
  await expect(page.locator('[data-wf-place]:not([data-wf-place="dock"])')).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("the ventures index has eleven real cards and keeps sample scores separate", async ({ page }) => {
  await page.goto("/ventures", { waitUntil: "networkidle" });
  const ids = [
    "caught-up",
    "titty-tuesdays",
    "goviral",
    "booksofhistory",
    "fightaiq",
    "carousel-studio",
    "marketingshark",
    "mma-files",
    "door-money",
    "tehdejsi-svet",
    "kvorum"
  ];
  const cards = page.locator("[data-venture-card]");
  await expect(cards).toHaveCount(ids.length);
  for (const id of ids) await expect(page.locator(`[data-venture-card="${id}"]`)).toHaveCount(1);

  const cardText = await cards.allInnerTexts();
  expect(cardText.join("\n")).not.toContain("Needs 35");
  expect(cardText.join("\n")).not.toContain("Test example");
  await expect(page.locator("[data-sample-idea]")).not.toHaveCount(0);
  await expect(page.getByText("Earlier software test · not current projects", { exact: true })).toBeVisible();
});

for (const size of [
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 }
] as const) {
  /*
   * Every room's dialog, complete and unscrolled.
   *
   * This used to measure the reframed room view — the overlay laid out inside the room's own
   * rectangle after the plan zoomed into it. There is no reframe now, so the question changed
   * with it: a dialog has to hold the whole room at the two viewports the contract names, without
   * its body scrolling and without the page behind it moving.
   */
  test(`every opened room fits its dialog at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Facilities", exact: true }).click();
    await expect(page.locator("[data-workflows-board]")).toBeVisible();

    /*
     * The scroll position once it has stopped moving.
     *
     * Navigating to a section scrolls the page, and that scroll is animated — reading `scrollY`
     * the instant the board appears reads the start of the journey, not the end. The question
     * here is whether opening a dialog moves the page, so the baseline has to be a page that has
     * already finished moving.
     */
    const settled = async (): Promise<number> => {
      let previous = -1;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const now = await page.evaluate(() => window.scrollY);
        if (now === previous) return now;
        previous = now;
        await page.waitForTimeout(100);
      }
      return previous;
    };

    for (const room of OPENABLE_ROOMS) {
      const scrollBefore = await settled();
      await page.locator(`[data-wf-place="${room}"]`).click({ force: true });
      const surface = page.locator("[data-dialog-surface]");
      await expect(surface, room).toBeVisible();

      const measured = await page.evaluate(() => {
        const body = document.querySelector("[data-dialog-body]");
        const shell = document.querySelector("[data-dialog-surface]");
        if (!body || !shell) return null;
        const box = shell.getBoundingClientRect();
        return {
          // Fits without scrolling: the body's content is no taller than its box.
          scrolled: body.scrollHeight - body.clientHeight,
          insideViewport: box.top >= 0 && box.bottom <= window.innerHeight
            && box.left >= 0 && box.right <= window.innerWidth,
          // Nothing spills sideways out of the dialog.
          spilling: [...body.querySelectorAll("p, span, a, li")].filter((element) => {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            return rect.left < box.left - 1 || rect.right > box.right + 1;
          }).length,
          named: shell.getAttribute("aria-labelledby") !== null,
          modal: shell.getAttribute("aria-modal") === "true"
        };
      });
      expect(measured, room).not.toBeNull();
      expect(measured!.scrolled, `${room} dialog scrolls at ${size.name}`).toBeLessThanOrEqual(1);
      expect(measured!.insideViewport, `${room} dialog leaves the viewport`).toBe(true);
      expect(measured!.spilling, `${room} dialog spills sideways`).toBe(0);
      expect(measured!.named).toBe(true);
      expect(measured!.modal).toBe(true);

      await page.keyboard.press("Escape");
      await expect(page.locator("[data-dialog-surface]")).toHaveCount(0);
      // The page behind a modal does not move.
      expect(await page.evaluate(() => window.scrollY), room).toBe(scrollBefore);
    }
  });
}

/**
 * The Design Lab workspace.
 *
 * Two tabs became one because each held half the answer to the only question the owner has of
 * this venture: what does this article's carousel look like, and can I change it. These cover the
 * four parts of that — the rail, the canvas, the controls and the words — and the one rule the
 * editor is not allowed to break, which is the engine's own thirty-word slide limit.
 */
test.describe("the Design Lab workspace", () => {
  test("renders the rail, the canvas and the recipe as one surface", async ({ page }) => {
    await page.goto("/admin?venture=carousel-studio&tab=studio", { waitUntil: "networkidle" });

    const rail = page.locator("[data-article-rail] button");
    expect(await rail.count()).toBeGreaterThan(0);
    await expect(page.locator("[data-recipe-line]").first()).toBeVisible();
    await expect(page.locator("[data-slide-canvas]").first()).toBeVisible();
    // An old bookmark still resolves rather than 404ing; an unknown tab falls to the first.
    const legacy = await page.goto("/admin?venture=carousel-studio&tab=decks", { waitUntil: "networkidle" });
    expect(legacy?.status()).toBe(200);
  });

  test("switching format changes the canvas ratio", async ({ page }) => {
    await page.goto("/admin?venture=carousel-studio&tab=studio", { waitUntil: "networkidle" });
    const canvas = page.locator("[data-slide-canvas]").first();
    const portrait = await canvas.evaluate((node) => getComputedStyle(node).aspectRatio);
    await page.getByRole("button", { name: "9:16", exact: true }).first().click();
    await expect.poll(async () => canvas.evaluate((node) => getComputedStyle(node).aspectRatio)).not.toBe(portrait);
    // The safe-area overlay is offered only where a platform actually covers the canvas.
    await page.getByRole("button", { name: "bezpečná zóna" }).first().click();
    await expect(page.locator("[data-safe-area]").first()).toBeAttached();
  });

  test("a slide past thirty words cannot be saved", async ({ page }) => {
    await page.goto("/admin?venture=carousel-studio&tab=studio", { waitUntil: "networkidle" });
    const editor = page.locator("textarea[id^='slide-']").first();
    const save = page.locator("[data-save-slide]").first();
    const original = await editor.inputValue();
    const shortText = `syntetický e2e obsah ${Date.now()} je zřetelně odlišný a zůstává pod limitem`;
    expect(shortText.trim()).not.toBe(original.trim());
    await expect.poll(async () => {
      await editor.fill(shortText);
      return save.isEnabled();
    }, { timeout: 30_000 }).toBe(true);
    const overLimitText = Array.from({ length: 31 }, (_, index) => `slovo${index}`).join(" ");
    const wordCount = page.locator("[data-word-count]").first();
    await expect.poll(async () => {
      await editor.fill(overLimitText);
      return wordCount.textContent();
    }, { timeout: 30_000 }).toContain("31/30");
    await expect(save).toBeDisabled();
    // The engine's own sentence, not a paraphrase of it.
    await expect(page.getByText(/přes limit 30 slov/u).first()).toBeVisible();
  });

  test("the caption carries its credit and the copy buttons announce", async ({ page }) => {
    await page.goto("/admin?venture=carousel-studio&tab=studio", { waitUntil: "networkidle" });
    const copy = page.getByRole("button", { name: /Copy/u }).first();
    await expect(copy).toHaveAttribute("aria-live", "polite");
    await expect(page.locator("[data-caption]").first()).toBeVisible();
  });
});

/**
 * Presets: a design saved, listed and applied.
 *
 * The round trip is the point. A saved preset that the picker cannot show is a file, not a tool,
 * and the file did not exist before this — which is why the store's create path had to be built
 * first rather than the preset list being hand-seeded onto main.
 */
test("a preset saves, reloads into the picker and applies", async ({ page }) => {
  await rm(presetsPath, { force: true });
  try {
    await page.goto("/admin?venture=carousel-studio&tab=studio", { waitUntil: "networkidle" });
    const recipeLine = page.locator("[data-recipe-line]").first();
    await expect.poll(async () => {
      await page.locator('[data-family="dossier"]').click();
      return recipeLine.textContent();
    }, { timeout: 30_000 }).toContain("dossier");
    await expect(page.locator("[data-save-state]").first()).toHaveAttribute("data-save-state", "saved", { timeout: 60_000 });

    const presetName = page.getByLabel("Název presetu").first();
    const save = page.locator("[data-save-preset]").first();
    await expect.poll(async () => {
      await presetName.fill("E2E tichý záznam");
      return save.isEnabled();
    }, { timeout: 30_000 }).toBe(true);
    const presetResponse = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname === "/admin/api/carousel-studio/recipe"
      && response.request().postDataJSON()?.presetName === "E2E tichý záznam"
    );
    await save.click();
    expect((await presetResponse).ok()).toBe(true);
    await expect(page.locator("[data-save-state]").first()).toHaveAttribute("data-save-state", "saved", { timeout: 60_000 });

    // Reload: the preset is read back out of the file the save created.
    await page.reload({ waitUntil: "networkidle" });
    const chip = page.locator("[data-presets] button", { hasText: "E2E tichý záznam" }).first();
    await expect(chip).toBeVisible();
    // Saved as a draft, and it says so — a draft is never drawn from autonomously.
    await expect(chip).toContainText("koncept");

    await expect.poll(async () => {
      await page.locator('[data-family="tower"]').click();
      return recipeLine.textContent();
    }, { timeout: 30_000 }).toContain("tower");
    await expect.poll(async () => {
      await chip.click();
      return recipeLine.textContent();
    }, { timeout: 30_000 }).toContain("dossier");
  } finally {
    await rm(presetsPath, { force: true });
  }
});

/**
 * The name resolves, and the id does not move.
 *
 * `carousel-studio` addresses state directories, config entries, API paths and a room on the
 * floorplan, so it stays (decision D13: identifiers stay, surfaces speak). What changes is that
 * the URL an owner would guess from the display name lands on the same record instead of an empty
 * page.
 */
test("design-lab is an alias for the same venture record", async ({ page }) => {
  await page.goto("/admin?venture=design-lab&tab=studio", { waitUntil: "networkidle" });
  await expect(page.locator("[data-recipe-line]").first()).toBeVisible();
  const aliased = await page.locator("[data-article-rail] button").count();

  await page.goto("/admin?venture=carousel-studio&tab=studio", { waitUntil: "networkidle" });
  expect(await page.locator("[data-article-rail] button").count()).toBe(aliased);
});

/**
 * Calendar tooltips, which the owner reported hiding behind the row of days and dates.
 *
 * Two causes in one place. The row block scrolls, so a bubble pointing up from the first rows was
 * clipped at its top edge; and the header row sits above it in the same stacking context, so
 * whatever survived the clip went behind the dates. A z-index fixes neither — an ancestor's
 * overflow is not a stacking question — so the bubble is a portal now, and it flips below the
 * trigger when there is no room above.
 */
test.describe("calendar tooltips clear the header row", () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    test(`fully visible on the first two rows at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/", { waitUntil: "networkidle" });
      await page.locator("[data-cal-rows]").first().scrollIntoViewIfNeeded();

      const rows = page.locator("[data-cal-rows] > div");
      for (const index of [0, 1]) {
        const cell = rows.nth(index).locator("[data-tooltip-anchor]").first();
        await cell.hover();
        const tip = page.locator("[role=tooltip]").first();
        await expect(tip).toBeVisible();

        const box = (await tip.boundingBox())!;
        // Inside the viewport on every edge: a bubble half off the top is the reported bug.
        expect(box.y, `row ${index} tooltip is clipped above the viewport`).toBeGreaterThanOrEqual(0);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

        // Rendered into the body, so no ancestor's overflow can clip it. The bubble itself is
        // pointer-events: none by design, which is why this is asserted structurally rather than
        // by hit-testing a point.
        expect(await tip.evaluate((node) => node.parentElement === document.body)).toBe(true);

        // And clear of the row of days and dates, which is what the owner saw it disappear behind.
        const header = (await page.locator("[data-cal-header]").first().boundingBox())!;
        const overlaps = box.y < header.y + header.height && box.y + box.height > header.y
          && box.x < header.x + header.width && box.x + box.width > header.x;
        expect(overlaps, `row ${index} tooltip overlaps the header row`).toBe(false);

        await page.mouse.move(0, 0);
        await expect(page.locator("[role=tooltip]")).toHaveCount(0);
      }
    });
  }

  test("a tooltip further down the week still points upward", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("[data-cal-rows]").first().scrollIntoViewIfNeeded();
    const rows = page.locator("[data-cal-rows] > div");
    const last = (await rows.count()) - 1;
    await rows.nth(last).locator("[data-tooltip-anchor]").first().hover();
    const tip = page.locator("[role=tooltip]").first();
    await expect(tip).toBeVisible();
    await expect(tip).toHaveAttribute("data-tooltip-side", "top");
  });
});

/**
 * The small controls, at the size they were written to be.
 *
 * The owner reported three of them reading as "one oversized family", and they were: an unlayered
 * `font: inherit` reset on form controls beat every size utility on every button on the site, so
 * a button declaring 7.5px and a button declaring 10px both rendered at the inherited 16px. The
 * reset lives in `@layer base` now and the three share one style, so this asserts the rendered
 * size rather than the class list — the class list was never the thing that was wrong.
 */
test("the meeting room's controls and the admin sign-out are one small family", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const home = await page.evaluate(() => {
    const jump = [...document.querySelectorAll("button")].find((node) => node.textContent?.includes("Jump to date"));
    const label = document.querySelector("[data-chat-list] button");
    return {
      jump: jump ? Number.parseFloat(getComputedStyle(jump).fontSize) : null,
      label: label ? Number.parseFloat(getComputedStyle(label).fontSize) : null,
      channelsLine: document.body.innerText.includes("read-only record")
    };
  });
  expect(home.jump).toBeLessThanOrEqual(11);
  expect(home.label).toBeLessThanOrEqual(12);
  // The line the owner asked to be gone, gone from the build rather than hidden.
  expect(home.channelsLine).toBe(false);

  await page.goto("/admin?venture=global", { waitUntil: "networkidle" });
  const signOut = await page.evaluate(() => {
    const node = [...document.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === "Sign out");
    return node ? Number.parseFloat(getComputedStyle(node).fontSize) : null;
  });
  // The same change, reaching admin: the three used to render identically at the browser default.
  expect(signOut).toBe(home.jump);
});

/**
 * Rooms and the dock, as dialogs.
 *
 * Clicking a room used to reframe the whole floor plan around it — a zoom, not a dialog, and one
 * that took the reader's place on the floor away to show them a rectangle. The dock opened a
 * seven-panel animation of a courier's morning that the owner could not read as anything. Both
 * are dialogs now, and a dialog has a list of obligations: focus moves in, Tab cannot leave,
 * Escape closes, the backdrop closes, focus returns to what opened it, and the page behind does
 * not scroll.
 */
test.describe("the facilities plan opens dialogs", () => {
  /*
   * The drawing in the dialog is the plan, cropped — not a second picture of a room.
   *
   * A separate illustration is a second thing that can disagree with the first. This asserts that
   * it is the same component under a viewBox of the room's own rectangle, and that the crop
   * carries none of the plan's pressable places into the modal.
   */
  test("the dialog shows the floor plan cropped to that room", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Facilities", exact: true }).click();
    const whole = await page.locator("svg[aria-label='Floor plan of the BoardlessAI office']").first().getAttribute("viewBox");

    for (const room of ["company", "fightaiq", "titty-tuesdays"]) {
      await page.locator(`[data-wf-place="${room}"]`).click({ force: true });
      const fragment = page.locator("[data-room-fragment] svg");
      await expect(fragment, room).toBeVisible();
      const cropped = await fragment.getAttribute("viewBox");
      expect(cropped, `${room} is not cropped`).not.toBe(whole);
      // The crop is the room's own rectangle plus a margin of wall, so it is far smaller than the
      // whole floor on both axes.
      const [, , width, height] = (cropped ?? "").split(" ").map(Number);
      const [, , wholeWidth] = (whole ?? "").split(" ").map(Number);
      expect(width!).toBeLessThan(wholeWidth! * 0.6);
      expect(height!).toBeGreaterThan(0);
      // Nothing pressable came with it: a modal containing four more buttons to the same rooms
      // would be nested interactive content and a second way to open a dialog from inside one.
      expect(await page.locator("[data-room-fragment] [data-wf-place]").count(), room).toBe(0);
      await page.keyboard.press("Escape");
    }
  });

  /*
   * The magazine rooms show the card a reader gets when the article is shared.
   *
   * "Latest output" was a line of prose. For a room whose output is a published article the
   * honest form of it is the share card itself — the picture, the headline and where it went.
   */
  test("a magazine room shows the share card, picture included", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Facilities", exact: true }).click();
    await page.locator('[data-wf-place="caught-up"]').click({ force: true });

    const card = page.locator("[data-latest-card]");
    await expect(card).toBeVisible();
    const image = page.locator("[data-latest-image]");
    await expect(image).toBeVisible();
    // A real image, decoded, not a broken one: the share card's whole point is the picture.
    await expect
      .poll(async () => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
    await page.keyboard.press("Escape");
  });

  test("a room opens and closes by mouse, and returns focus", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const plan = page.locator("[data-wf-place]").first();
    await plan.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);

    // Forced: the room's own furniture sits over its group, and a click on a child still opens
    // the room — which is the behaviour, not a bug for the test to route around politely.
    await plan.click({ force: true });
    const dialog = page.locator("[role=dialog][data-dialog-surface]");
    await expect(dialog).toBeVisible();
    // The plan behind it is whole: no reframed viewBox, no zoom.
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
    await expect(page.locator("[data-room-fragment]")).toBeVisible();

    await page.locator("[data-dialog-backdrop]").click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);
    // Focus is back on the door it came out of, not on the body.
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-wf-place") !== null)).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
  });

  test("a room opens and closes by keyboard alone", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const plan = page.locator("[data-wf-place]").first();
    await plan.scrollIntoViewIfNeeded();
    await plan.focus();
    await page.keyboard.press("Enter");
    const dialog = page.locator("[role=dialog][data-dialog-surface]");
    await expect(dialog).toBeVisible();

    // Tab cannot leave: every stop stays inside the dialog.
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-dialog-surface]")))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("the dock says what it is in plain words", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const dock = page.locator('[data-wf-place="dock"]').first();
    await dock.scrollIntoViewIfNeeded();
    await dock.click({ force: true });
    const dialog = page.locator("[role=dialog][data-dialog-surface]");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("the only way out of the building");
    await expect(page.locator("[data-dock-latest]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("no room reframes the drawing any more", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const plan = page.locator("[data-wf-place]").first();
    await plan.scrollIntoViewIfNeeded();
    const svg = page.locator("svg[aria-label='Floor plan of the BoardlessAI office']").first();
    const before = await svg.getAttribute("viewBox");
    await plan.click({ force: true });
    await expect(page.locator("[role=dialog][data-dialog-surface]")).toBeVisible();
    expect(await svg.getAttribute("viewBox")).toBe(before);
    await page.keyboard.press("Escape");
  });
});

/**
 * The roster shows every role, counted rather than eyeballed.
 *
 * It used to show the council plus whichever specialists were active and put the rest behind a
 * "stood down" count with no way to reach them — a footnote saying nine roles exist that you may
 * not read. The count comes from `config/agents.json` here, so the assertion cannot drift with the
 * registry: adding a role to the company adds it to this test's expectation on the same commit.
 */
test.describe("the roster lists every agent", () => {
  test("renders one entry per registry agent, with paused and retired labelled", async ({ page }) => {
    const registry = JSON.parse(await readFile(path.join(repositoryRoot, "config", "agents.json"), "utf8")) as
      { agents?: Array<{ id: string; status: string }> } | Array<{ id: string; status: string }>;
    const agents = Array.isArray(registry) ? registry : registry.agents ?? [];
    expect(agents.length).toBeGreaterThan(0);

    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Team", exact: true }).click();
    await expect(page.locator("[data-team-panel]")).toBeVisible();

    const rendered = await page.evaluate(() => ({
      council: document.querySelectorAll("[data-team-council] > div").length,
      others: document.querySelectorAll("[data-team-role]").length,
      paused: document.querySelectorAll('[data-team-status="paused"]').length,
      retired: document.querySelectorAll('[data-team-status="retired"]').length,
      count: document.querySelector("[data-team-count]")?.textContent ?? ""
    }));

    expect(rendered.council + rendered.others, "one card per agent in config/agents.json").toBe(agents.length);
    expect(rendered.paused).toBe(agents.filter((agent) => agent.status === "paused").length);
    expect(rendered.retired).toBe(agents.filter((agent) => agent.status === "retired").length);
    expect(rendered.count).toContain(`${agents.length} roles`);
    expect(rendered.count).toContain(`${agents.filter((agent) => agent.status === "active").length} active`);
  });

  /*
   * In the panel, not merely in the document.
   *
   * The first version of this rendered all forty-two and left twenty-two of them below the fold of
   * an inner scroller, so a reader counted the roster at twenty and was right about what they
   * could see. Being in the DOM is not the same as being shown.
   */
  for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    test(`shows the whole roster without scrolling at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Team", exact: true }).click();
      await expect(page.locator("[data-team-panel]")).toBeVisible();

      const measured = await page.evaluate(() => {
        const scroller = document.querySelector("[data-team-scroll]")!;
        const rows = [...document.querySelectorAll("[data-team-role], [data-team-council] > div")];
        const box = scroller.getBoundingClientRect();
        return {
          total: rows.length,
          visible: rows.filter((row) => {
            const rect = row.getBoundingClientRect();
            return rect.top >= box.top - 2 && rect.bottom <= box.bottom + 2;
          }).length
        };
      });
      expect(measured.visible, `${measured.visible} of ${measured.total} roles are on screen`).toBe(measured.total);
    });
  }

  test("holds at 360px without clipping a name", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/", { waitUntil: "networkidle" });
    // At 360px the sections stack rather than being navigated between, so the panel is scrolled
    // to rather than clicked to.
    const panel = page.locator("[data-team-panel]");
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toBeVisible();

    const spilling = await page.evaluate(() => {
      const box = document.querySelector("[data-team-panel]")!.getBoundingClientRect();
      return [...document.querySelectorAll("[data-team-role] span, [data-team-role] p, [data-team-council] p")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0) return false;
          return rect.left < box.left - 1 || rect.right > box.right + 1;
        }).length;
    });
    expect(spilling).toBe(0);
  });
});

/**
 * The footers open their content where the reader is.
 *
 * Every one of these links used to navigate away to a page built in the previous design, so
 * following "Privacy" from halfway down the office walkthrough lost the walkthrough. The pages are
 * not deleted — they are the canonical addresses, they are in the sitemap, and a deep link still
 * resolves — which is why the old routes are asserted alongside the dialogs.
 */
test.describe("footer links open dialogs", () => {
  const topics = ["about", "rules", "money", "privacy", "disclosure", "updates"] as const;

  test("every content link opens its own dialog", async ({ page }) => {
    await page.goto("/company", { waitUntil: "networkidle" });
    for (const topic of topics) {
      const surface = page.locator("[data-dialog-surface]");
      await expect.poll(async () => {
        await page.locator(`[data-footer-dialog="${topic}"]`).first().click();
        return surface.isVisible();
      }, { message: topic, timeout: 30_000 }).toBe(true);
      // Real content, not an empty shell with a title on it.
      expect((await surface.innerText()).length, topic).toBeGreaterThan(600);
      // And no way out to a page built in the previous design. The dialog carries the answer or
      // it does not answer.
      expect(await surface.locator("a").count(), `${topic} links away`).toBe(0);
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-dialog-surface]")).toHaveCount(0);
    }
  });

  test("the feeds stay files", async ({ page, request }) => {
    await page.goto("/company", { waitUntil: "networkidle" });
    for (const feed of ["/feed.xml", "/decisions.xml", "/feed.json"]) {
      await expect(page.locator(`footer a[href="${feed}"]`)).toHaveCount(1);
      expect((await request.get(feed)).status(), feed).toBe(200);
    }
  });

  test("the old routes still resolve", async ({ request }) => {
    for (const route of ["/company", "/privacy", "/disclosure", "/log", "/results", "/about", "/money"]) {
      // /about and /money are permanent redirects to sections of the pages that replaced them,
      // which is still a working deep link and not a 404.
      expect((await request.get(route)).status(), route).toBe(200);
    }
  });

  test("one full keyboard pass over a footer dialog", async ({ page }) => {
    await page.goto("/company", { waitUntil: "networkidle" });
    const opener = page.locator('[data-footer-dialog="disclosure"]').first();
    await opener.focus();
    await page.keyboard.press("Enter");
    const surface = page.locator("[data-dialog-surface]");
    await expect(surface).toBeVisible();
    await expect(surface).toHaveAttribute("aria-modal", "true");
    expect(await surface.getAttribute("aria-labelledby")).not.toBeNull();

    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-dialog-surface]")))).toBe(true);
    }
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-dialog-surface]")))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator("[data-dialog-surface]")).toHaveCount(0);
    // Focus is back on the link that opened it.
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-footer-dialog"))).toBe("disclosure");
  });
});

/**
 * Navigation that does not move under a pointer.
 *
 * Every label in the walkthrough's rail carried twelve pixels of permanent empty gap for an
 * indicator dot that was only painted on the active one — the reserved space was itself the bug
 * the owner reported. The dot is out of the flow now, and the right-hand rail's buttons are a
 * fixed slot rather than 7px or 10px depending on which section you are in. These measure boxes
 * rather than trusting the class list.
 */
test.describe("navigation reserves no space it does not paint", () => {
  test("hovering a walkthrough nav item moves nothing", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const items = page.locator("[data-nav-item]");
    const count = await items.count();
    expect(count).toBeGreaterThan(3);

    const boxes = async () => page.evaluate(() =>
      [...document.querySelectorAll("[data-nav-item]")].map((node) => {
        const rect = node.getBoundingClientRect();
        return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)].join(",");
      }));

    const before = await boxes();
    for (let index = 0; index < count; index += 1) {
      await items.nth(index).hover();
      expect(await boxes(), `hovering item ${index} moved the rail`).toEqual(before);
    }
    await page.mouse.move(0, 0);
    expect(await boxes()).toEqual(before);
  });

  test("the section rail's buttons are one fixed size in every state", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll("[data-dot]")].map((node) => {
        const rect = node.getBoundingClientRect();
        return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      }));
    expect(sizes.length).toBeGreaterThan(3);
    expect(new Set(sizes).size, "the rail's buttons are not all one size").toBe(1);

    // Move to another section: the active mark changes and no button's box does.
    const before = sizes;
    await page.locator("[data-dot]").nth(2).click();
    await expect.poll(async () => page.evaluate(() =>
      [...document.querySelectorAll("[data-dot]")].map((node) => {
        const rect = node.getBoundingClientRect();
        return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      }))).toEqual(before);
  });

  test("the top navigation shifts colour and nothing else", async ({ page }) => {
    await page.goto("/company", { waitUntil: "networkidle" });
    const links = page.locator("header nav a");
    const count = await links.count();
    const boxes = async () => page.evaluate(() =>
      [...document.querySelectorAll("header nav a")].map((node) => {
        const rect = node.getBoundingClientRect();
        return [Math.round(rect.x), Math.round(rect.width), Math.round(rect.height)].join(",");
      }));
    const before = await boxes();
    for (let index = 0; index < count; index += 1) {
      await links.nth(index).hover();
      expect(await boxes(), `hovering link ${index} moved the header`).toEqual(before);
    }
  });

  test("reduced motion keeps the same geometry", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "networkidle" });
    const item = page.locator("[data-nav-item]").first();
    const before = await item.boundingBox();
    await item.hover();
    expect(await item.boundingBox()).toEqual(before);
  });
});

/**
 * A list scrolls before the page jumps.
 *
 * The walkthrough claims the wheel for the whole page and turns a gesture into a jump between
 * sections. Over anything that scrolls inside a section — the meetings room's message pane, the
 * calendar's rows — that was wrong twice over: the list could not be scrolled, and the reader was
 * moved somewhere they had not asked to go. The browser would have chained the scroll to the inner
 * element and only reached the page at its end, which is the behaviour restored here.
 */
test.describe("scrolling a list does not jump the section", () => {
  test("the wheel scrolls the calendar's rows and leaves the section alone", async ({ page }) => {
    // Short enough that the day does not fit, which is the state the bug lived in: a reader on a
    // laptop trying to reach the evening rooms and being thrown into the next section instead.
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    const rows = page.locator("[data-cal-rows]");
    await expect(rows).toBeVisible();

    // Only meaningful if the list actually overflows at this viewport.
    const overflow = await rows.evaluate((node) => node.scrollHeight - node.clientHeight);
    test.skip(overflow < 20, "the calendar fits without scrolling at this size");

    const settled = async (): Promise<number> => {
      let previous = -1;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const now = await page.evaluate(() => window.scrollY);
        if (now === previous) return now;
        previous = now;
        await page.waitForTimeout(100);
      }
      return previous;
    };
    const pageBefore = await settled();

    const box = (await rows.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 200);
    await expect.poll(async () => rows.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    // And the page stayed where it was: the gesture went to the list, not to the walk.
    expect(await page.evaluate(() => window.scrollY)).toBe(pageBefore);
  });

  test("the wheel hands back to the walk at the end of a list", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    const rows = page.locator("[data-cal-rows]");
    await expect(rows).toBeVisible();
    // Park the list at its end, which is where the reader who has finished reading it is.
    await rows.evaluate((node) => { node.scrollTop = node.scrollHeight; });

    const before = await page.evaluate(() => window.scrollY);
    const box = (await rows.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 260);
    // An exempt subtree would trap the reader here forever; travel-aware chaining moves the walk.
    await expect.poll(async () => page.evaluate(() => window.scrollY), { timeout: 8_000 }).not.toBe(before);
  });
});
