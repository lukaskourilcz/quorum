import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const axeRoutes = [
  "/",
  "/meetings/2026-07-30-cu-edition",
  "/meetings/2026-07-30-cu-product",
  "/ideas",
  "/ventures/caught-up",
  "/ventures/titty-tuesdays",
  "/ventures/fightaiq",
  "/incubator",
  "/admin?venture=incubator&tab=niche-proposals",
  "/admin/ventures/titty-tuesdays/binder",
  "/admin?venture=fightaiq&tab=fighters",
  "/admin?venture=fightaiq&tab=events",
  "/admin?venture=fightaiq&tab=slates",
  "/admin?venture=fightaiq&tab=sources",
  "/admin?venture=mma-files&tab=articles",
  "/admin?venture=mma-files&tab=calendar",
  "/admin?venture=mma-files&tab=social-lab",
  "/meetings/2026-08-01-mma-intake",
  "/meetings/2026-08-01-mma-analysis",
  "/meetings/2026-08-01-mag-editorial",
  "/meetings/2026-08-01-mag-desk"
];

const repositoryRoot = path.resolve(process.cwd(), "..");
const e2ePlanPath = path.join(repositoryRoot, "state", "ventures", "titty-tuesdays", "plans", "e2e-launch-plan.json");
const e2eProposalPath = path.join(repositoryRoot, "state", "ventures", "incubator", "niche-proposals", "e2e-proposal.json");
const ratingLedgerPath = path.join(repositoryRoot, "state", "ratings", "incubator", "ledger.jsonl");
let originalRatingLedger: string | null = null;

test.beforeAll(async () => {
  try {
    originalRatingLedger = await readFile(ratingLedgerPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await Promise.all([
    mkdir(path.dirname(e2ePlanPath), { recursive: true }),
    mkdir(path.dirname(e2eProposalPath), { recursive: true }),
    mkdir(path.dirname(ratingLedgerPath), { recursive: true })
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
    status: "approved",
    originMeetingRef: "meetings/2026-08-01-tt-marketing"
  }));
  await writeFile(e2eProposalPath, JSON.stringify({
    schemaVersion: "niche-proposal/1",
    id: "niche-2026-08-04-e2e0",
    domain: "E2E repair brief",
    oneLiner: "A temporary proposal used only to verify the protected rating path.",
    whyPeopleCareDaily: "The test checks persistence and shortlist projection, not a market claim.",
    audienceHypothesis: {
      regions: ["Europe"],
      ageRange: { min: 25, max: 60 },
      genders: ["all"],
      interests: ["repair"],
      platforms: ["web"],
      adTargetingNotes: "No advertising; test fixture only."
    },
    contentShape: {
      cadence: "weekday",
      formats: ["brief"],
      caughtUpReuseNotes: "Reuse the edition contract only after approval."
    },
    competitionNotes: [],
    risks: ["Test fixture must be removed."],
    evidenceRefs: [],
    status: "proposed",
    originMeetingRef: "meetings/2026-08-01-incubator-synthesis"
  }));
});

test.afterAll(async () => {
  await Promise.all([
    rm(e2ePlanPath, { force: true }),
    rm(e2eProposalPath, { force: true })
  ]);
  if (originalRatingLedger === null) await rm(ratingLedgerPath, { force: true });
  else await writeFile(ratingLedgerPath, originalRatingLedger);
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

test("WeekBoard navigates between statically generated weeks", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-scroll-behavior",
    "smooth"
  );
  const weekBoard = page.getByTestId("week-board");
  await expect(weekBoard).toBeVisible();
  await expect(weekBoard.locator(".contents")).toHaveCount(14);
  await expect(weekBoard.locator("[data-project-icon]")).toHaveCount(14);
  await expect(page.locator("[data-project-legend]")).toHaveCount(6);
  await expect(weekBoard.locator("[data-calendar-slot] time")).toHaveCount(0);
  await expect(weekBoard.locator('[data-calendar-state="test"]')).not.toHaveCount(0);
  await expect(weekBoard.locator('[data-calendar-state="held"]')).not.toHaveCount(0);
  await expect(weekBoard.locator('[data-calendar-state="missed"]')).not.toHaveCount(0);
  await expect(weekBoard.locator('[data-calendar-state="scheduled"]')).not.toHaveCount(0);
  const next = page.getByRole("link", { name: "Next calendar week" });
  await expect(next).toHaveAttribute("href", /\/calendar\/\d{4}-\d{2}-\d{2}/);
  await next.click();
  await expect(page).toHaveURL(/\/calendar\/\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByTestId("week-board")).toBeVisible();
  await expect(page.getByRole("link", { name: "Previous calendar week" })).toBeVisible();
});

test("every agent card and profile exposes its configured API model and estimated call cost", async ({ page }) => {
  await page.goto("/agents", { waitUntil: "networkidle" });
  await expect(page.locator("[data-agent-api-model]")).toHaveCount(38);
  await expect(page.locator("[data-agent-api-cost-summary]")).toHaveCount(38);
  await expect(page.getByText("OpenAI · GPT-5.6 Luna").first()).toBeVisible();
  await expect(page.getByText("Anthropic · Claude Haiku 4.5").first()).toBeVisible();

  await page.goto("/agents/hacek", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Model calls" })).toBeVisible();
  await expect(page.locator("[data-agent-api-routes]")).toContainText("Claude Sonnet 4.6");
  await expect(page.locator("[data-agent-api-routes]")).toContainText("Caught Up Czech edition");
  await expect(page.locator("[data-agent-api-routes]")).toContainText("MMA Files Czech edition");
  await expect(page.locator("[data-agent-api-routes]")).toContainText("Approx. cost per live run");
  await expect(page.locator("[data-agent-api-cost]").first()).toHaveText(/^\$0\.0[1-9]/);
});

test("metrics role column keeps the table inset", async ({ page }) => {
  await page.goto("/metrics", { waitUntil: "networkidle" });
  const roleHead = page.getByRole("columnheader", { name: "Role" });
  const firstRole = page.locator("tbody tr").first().getByRole("cell").first();
  await expect(roleHead).toHaveCSS("padding-left", "32px");
  await expect(firstRole).toHaveCSS("padding-left", "32px");
});

test("admin rating persists, feeds the incubator shortlist, and the launch binder renders", async ({ page }) => {
  await page.goto("/admin?venture=incubator&tab=niche-proposals", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "E2E repair brief" })).toBeVisible();
  await page.getByLabel("Note (optional)").fill("E2E owner note");
  await page.getByRole("button", { name: "Perfect", exact: true }).click();
  await expect(page.getByText("Rating saved to the permanent history.")).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Magazine ideas to keep reviewing")).toBeVisible();
  await expect(page.getByText("E2E repair brief").first()).toBeVisible();
  await expect(page.getByText("Rating history (1)")).toBeVisible();

  await page.goto("/admin/ventures/titty-tuesdays/binder", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Titty Tuesdays" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E launch binder plan" })).toBeVisible();
  await expect(page.getByText("1 ready plans")).toBeVisible();
});

test("admin login explains errors, starts a session and signs out", async ({ page }) => {
  await page.context().clearCookies();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/admin\/login\?error=expired$/);
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
  await expect(page).toHaveURL(/\/admin\/login\?error=invalid$/);
  await expect(page.getByText("Those details did not match")).toBeVisible();

  await page.getByLabel("Username").fill("e2e-owner");
  await page.locator('input[name="password"]').fill("e2e-password");
  await page.getByRole("button", { name: "Open project desk" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Project desk." })).toBeVisible();
  await expect(page.getByText(/^Updated /)).toHaveText(
    /^Updated [A-Z][a-z]{2} \d{2}, \d{4} · \d{2}:\d{2} Prague time$/
  );

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login\?error=expired$/);
});

const responsiveRoutes = ["/", "/agents", "/agents/hacek", "/calendar/2026-07-27", "/ventures/titty-tuesdays", "/ventures/fightaiq", "/incubator", "/admin?venture=incubator&tab=niche-proposals", "/admin?venture=fightaiq&tab=events", "/admin?venture=mma-files&tab=social-lab"];

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

  await page.goto("/", { waitUntil: "networkidle" });
  const nextWeek = page.getByRole("link", { name: "Next calendar week" });
  await nextWeek.scrollIntoViewIfNeeded();
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

test("Council Simulator controls preserve page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/boardroom", { waitUntil: "networkidle" });

  const templates = page.getByRole("group", {
    name: "Meeting topics"
  });
  const nextTemplate = templates.getByRole("button").nth(1);
  await nextTemplate.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(0);
  await nextTemplate.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY);
});

for (const [route, heading] of [
  ["/meetings/2026-07-30-cu-edition", "Choose the edition"],
  ["/meetings/2026-07-30-cu-product", "Decide the product idea"],
  ["/meetings/2026-08-01-mma-intake", "Check the fight data"],
  ["/meetings/2026-08-01-mma-analysis", "Review the model without guessing"],
  ["/meetings/2026-08-01-mag-editorial", "Choose or reject both article slots"],
  ["/meetings/2026-08-01-mag-desk", "Check today’s articles and social drafts"]
] as const) {
  test(`renders the new room kind at ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: new RegExp(heading) })).toBeVisible();
    await expect(page.getByText("Every saved message")).toBeVisible();
    await expect(page.locator("ol li").first()).toBeVisible();
  });
}
