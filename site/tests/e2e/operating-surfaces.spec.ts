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
  await expect(page.getByTestId("week-board")).toBeVisible();
  const next = page.getByRole("link", { name: "Next calendar week" });
  await expect(next).toHaveAttribute("href", /\/calendar\/\d{4}-\d{2}-\d{2}/);
  await next.click();
  await expect(page).toHaveURL(/\/calendar\/\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByTestId("week-board")).toBeVisible();
  await expect(page.getByRole("link", { name: "Previous calendar week" })).toBeVisible();
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
