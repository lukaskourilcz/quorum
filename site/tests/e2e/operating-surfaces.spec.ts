import AxeBuilder from "@axe-core/playwright";
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
  "/money",
  "/admin?venture=global",
  "/admin?venture=titty-tuesdays&tab=plans",
  "/admin/ventures/titty-tuesdays/binder",
  "/admin?venture=fightaiq&tab=fighters",
  "/admin?venture=fightaiq&tab=events",
  "/admin?venture=fightaiq&tab=slates",
  "/admin?venture=fightaiq&tab=sources",
  "/admin?venture=mma-files&tab=articles",
  "/admin?venture=mma-files&tab=calendar",
  "/admin?venture=mma-files&tab=social-lab",
  "/admin?venture=carousel-studio&tab=templates",
  "/admin?venture=carousel-studio&tab=inspiration",
  "/meetings/2026-08-01-mma-intake",
  "/meetings/2026-08-01-mma-analysis",
  "/meetings/2026-08-01-mag-editorial",
  "/meetings/2026-08-01-mag-desk",
  "/meetings/2026-08-01-studio"
];

const repositoryRoot = path.resolve(process.cwd(), "..");
const e2ePlanPath = path.join(repositoryRoot, "state", "ventures", "titty-tuesdays", "plans", "e2e-launch-plan.json");
const ratingLedgerPath = path.join(repositoryRoot, "state", "ratings", "titty-tuesdays", "ledger.jsonl");
let originalRatingLedger: string | null = null;

test.beforeAll(async () => {
  try {
    originalRatingLedger = await readFile(ratingLedgerPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await Promise.all([
    mkdir(path.dirname(e2ePlanPath), { recursive: true }),
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
});

test.afterAll(async () => {
  await rm(e2ePlanPath, { force: true });
  if (originalRatingLedger === null) await rm(ratingLedgerPath, { force: true });
  else await writeFile(ratingLedgerPath, originalRatingLedger);
});

for (const route of axeRoutes) {
  test(`WCAG AA operating surface — ${route}`, async ({ page }) => {
    // An axe pass over an admin surface is a full page load plus a whole-DOM rule sweep, and the
    // heavier ones measure 18-30s against the 30s default. They have not been failing on
    // violations — they have been failing on the clock, one at a time and whichever happened to
    // be unlucky. 90s leaves the sweep room without hiding a route that genuinely will not load.
    test.setTimeout(90_000);
    await page.goto(route, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}

test("WeekBoard navigates between statically generated weeks", async ({ page }) => {
  // The five-day board is /calendar's product now. The home page walks past a calendar of its
  // own — a full week, stepped in place — and this test is about the linked, statically
  // generated weeks, which only /calendar has.
  await page.goto("/calendar", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-scroll-behavior",
    "smooth"
  );
  const weekBoard = page.getByTestId("week-board");
  await expect(weekBoard).toBeVisible();
  // One row per calendar slot, and the registry decides how many slots there are — it was
  // fifteen while the Magazine Incubator ran and is twelve now. Pinning the number meant the
  // board's own guard broke every time a venture opened or closed; what it is really protecting
  // is that every slot renders exactly one row and one project icon.
  await expect(weekBoard.locator(".contents")).toHaveCount(CALENDAR_SLOTS.length);
  await expect(weekBoard.locator("[data-project-icon]")).toHaveCount(CALENDAR_SLOTS.length);
  // Eight, not seven. The Design Lab joined `projectDetails` in `3e081c8` on 2 August and this
  // assertion was never moved, so the guard has been red ever since — on a board that was right.
  // The venture joined by owner decision; the number was the thing that was stale.
  await expect(page.locator("[data-project-legend]")).toHaveCount(8);
  await expect(weekBoard.locator("[data-calendar-slot] time")).toHaveCount(0);
  // No assertion that a fixture is on the board. There were test meetings on it when the archive
  // was young; there are none now, and requiring one would be requiring the company to keep
  // sample data in a public week.
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

// The rated object used to be a niche proposal, and the assertion after the reload used to be
// the incubator shortlist. Both left with the venture; what the test is actually for — a rating
// survives the round trip to the ledger and comes back as history — is unchanged, so it now runs
// on the plan card the binder assertion below already needs.
test("admin rating persists and the launch binder renders", async ({ page }) => {
  // Two full page loads, a write to the ledger on disk, a reload, and a third page. The default
  // 30s covered it when this was a lighter page and does not now.
  test.setTimeout(120_000);
  await page.goto("/admin?venture=titty-tuesdays&tab=plans", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "E2E launch binder plan" })).toBeVisible();
  await page.getByLabel("Note (optional)").first().fill("E2E owner note");
  await page.getByRole("button", { name: "Perfect", exact: true }).first().click();
  // The confirmation appears only after `POST /admin/api/ratings` has appended to the ledger on
  // disk, and on a dev server under load that round trip runs past the 5s an expectation gets by
  // default — which is why this has been the suite's most reliable false negative, failing on the
  // clock rather than on the app. The widget's own "Saving rating…" state is asserted first, so a
  // click that never fired still fails immediately rather than waiting out the longer budget.
  await expect(page.getByText(/Saving rating|Rating saved/)).toBeVisible();
  await expect(page.getByText("Rating saved to the permanent history.")).toBeVisible({ timeout: 30_000 });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Rating history (1)")).toBeVisible({ timeout: 30_000 });

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
  // The "Updated at" tile went with the redesign: the page is force-dynamic and behind a
  // credential check, so a rendered-at timestamp told the owner only that the page had rendered.
  // What is worth asserting is that the protected shell came up — breadcrumb, state badge and the
  // way back out.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login\?error=expired$/);
});

const responsiveRoutes = ["/", "/agents", "/agents/hacek", "/calendar/2026-07-27", "/ventures/titty-tuesdays", "/ventures/fightaiq", "/ventures/carousel-studio", "/money", "/admin?venture=global", "/admin?venture=titty-tuesdays&tab=plans", "/admin?venture=fightaiq&tab=events", "/admin?venture=mma-files&tab=social-lab", "/admin?venture=carousel-studio&tab=templates"];

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
  "titty-tuesdays"
] as const;

for (const size of [
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 }
] as const) {
  test(`every opened room is centred, complete and readable at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Facilities", exact: true }).click();
    await expect(page.locator("[data-workflows-board]")).toBeVisible();

    for (const room of OPENABLE_ROOMS) {
      const back = page.locator('[data-room-view] button[aria-label="Back to the floor"]');
      if (await back.count()) await back.click();
      await page.locator(`[data-wf-place="${room}"]`).click();
      await expect(page.locator("[data-room-view]")).toBeVisible();

      const measured = await page.evaluate(() => {
        const stage = document.querySelector("[data-workflows-board] svg")?.parentElement;
        const view = document.querySelector("[data-room-view]");
        if (!stage || !view) return null;
        const sb = stage.getBoundingClientRect();
        const vb = view.getBoundingClientRect();
        // Anything sticking out sideways is real overflow: there is no horizontal scroller here.
        // Vertically, content below the fold of the room's own scroller is scrolled, not clipped.
        const spilling = Array.from(view.querySelectorAll("p, span, a")).filter((element) => {
          const b = element.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) return false;
          return b.left < vb.left - 1 || b.right > vb.right + 1;
        }).length;
        const scroller = view.querySelector("[data-wheel-exempt]");
        // Where the open room's own rectangle landed on the stage. This is the framing itself,
        // and it is what the repair changed: the arithmetic used to grow the room's rect to the
        // container's aspect, which left the room's walls 6% from the stage edge with the plan's
        // north wall and the notes at its door cropped off.
        const rb = document.querySelector("[data-open-room]")?.getBoundingClientRect();
        return {
          insideStage:
            vb.left >= sb.left - 1 &&
            vb.right <= sb.right + 1 &&
            vb.top >= sb.top - 1 &&
            vb.bottom <= sb.bottom + 1,
          fractionOfHeight: vb.height / sb.height,
          width: vb.width,
          spilling,
          scrolls: scroller ? getComputedStyle(scroller).overflowY : null,
          dimmed: Boolean(document.querySelector("[data-wf-scrim]")),
          roomBindingSpan: rb ? Math.max(rb.width / sb.width, rb.height / sb.height) : null,
          roomClearance: rb
            ? Math.min(
                rb.top - sb.top,
                sb.bottom - rb.bottom,
                rb.left - sb.left,
                sb.right - rb.right
              ) / Math.min(sb.width, sb.height)
            : null
        };
      });

      expect(measured, `${room} renders a room view`).not.toBeNull();
      expect(measured!.insideStage, `${room} sits inside the stage`).toBe(true);
      // The room owns the stage rather than sharing it with its neighbours.
      expect(measured!.fractionOfHeight, `${room} claims the stage's height`).toBeGreaterThan(0.6);
      // And it is wide enough to read: 34 characters of body text plus its padding.
      expect(measured!.width, `${room} is wide enough to read`).toBeGreaterThanOrEqual(380);
      expect(measured!.spilling, `${room} keeps its content inside itself`).toBe(0);
      expect(measured!.scrolls, `${room} scrolls rather than overflowing`).toBe("auto");
      expect(measured!.dimmed, `${room} pushes the rest of the plan back`).toBe(true);
      // The framing itself: the room owns its binding axis, and its walls are not jammed against
      // the stage edge. The old arithmetic gave 0.87 and 0.064 — it passes the first and fails
      // the second, which is exactly the reported symptom of a room cropped at both ends.
      expect(measured!.roomBindingSpan, `${room}'s rect owns its binding axis`).toBeGreaterThan(0.6);
      expect(measured!.roomClearance, `${room}'s walls have breathing room`).toBeGreaterThan(0.08);
    }

    // Escape closes the room and the plan comes back whole, with nothing dimmed.
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-room-view]")).toHaveCount(0);
    await expect(page.locator("[data-wf-scrim]")).toHaveCount(0);
  });
}
