import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const axeRoutes = [
  "/",
  "/meetings/2026-07-30-cu-edition",
  "/meetings/2026-07-30-cu-product",
  "/ideas",
  "/ventures/caught-up"
];

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
  await expect(page.getByTestId("week-board")).toBeVisible();
  const next = page.getByRole("link", { name: "Next calendar week" });
  await expect(next).toHaveAttribute("href", /\/calendar\/\d{4}-\d{2}-\d{2}/);
  await next.click();
  await expect(page).toHaveURL(/\/calendar\/\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByTestId("week-board")).toBeVisible();
  await expect(page.getByRole("link", { name: "Previous calendar week" })).toBeVisible();
});

test("stateful route controls preserve page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/ideas", { waitUntil: "networkidle" });
  const accepted = page.getByRole("link", { name: "accepted", exact: true });
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
    .getByRole("button", { name: "Step through without a forecast" })
    .click();

  const nextTurn = page.getByRole("button", { name: "Next turn" });
  await nextTurn.scrollIntoViewIfNeeded();
  const nextScrollY = await page.evaluate(() => window.scrollY);
  expect(nextScrollY).toBeGreaterThan(0);
  await nextTurn.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(nextScrollY);

  const previousTurn = page.getByRole("button", { name: "Previous turn" });
  const previousScrollY = await page.evaluate(() => window.scrollY);
  await previousTurn.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(previousScrollY);
});

test("Council Simulator controls preserve page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/boardroom", { waitUntil: "networkidle" });

  const templates = page.getByRole("group", {
    name: "Decision room templates"
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
  ["/meetings/2026-07-30-cu-product", "Decide the product idea"]
] as const) {
  test(`renders the new room kind at ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: new RegExp(heading) })).toBeVisible();
    await expect(page.getByText("Every recorded turn")).toBeVisible();
    await expect(page.locator("ol li").first()).toBeVisible();
  });
}
