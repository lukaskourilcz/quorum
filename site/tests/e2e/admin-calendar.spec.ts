import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/*
 * The marketing Calendar (quorum#592): both plans open, the week moves, an entry opens from the
 * grid and from the list, the keyboard walks the grid, and the list filters through the query
 * string. Read-only: every non-GET request is aborted and reported, because this screen must never
 * write while it is only being looked at.
 */

interface Plan { entries: Array<{ id: string; date: string; platform: string; title: string }>; period?: { start: string } }

const plans = {
  marketingshark: JSON.parse(readFileSync(path.resolve(process.cwd(), "../state/marketing-calendar/marketingshark.json"), "utf8")) as Plan,
  "caught-up": JSON.parse(readFileSync(path.resolve(process.cwd(), "../state/marketing-calendar/caught-up.json"), "utf8")) as Plan
};

async function guardMutations(page: Page): Promise<string[]> {
  const attempted: string[] = [];
  await page.route("**/*", (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD") return route.continue();
    attempted.push(`${method} ${route.request().url()}`);
    return route.abort();
  });
  return attempted;
}

for (const venture of ["marketingshark", "caught-up"] as const) {
  test(`the ${venture} plan renders its brief, week, month and complete list`, async ({ page }) => {
    const attempted = await guardMutations(page);
    const plan = plans[venture];
    await page.goto(`/admin/calendar?venture=${venture}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: "Calendar." })).toBeVisible();
    await expect(page.locator(`[data-marketing-calendar="${venture}"]`)).toBeVisible();
    await expect(page.locator("[data-calendar-summary]")).toBeVisible();
    await expect(page.locator('[role="grid"][data-calendar-week]')).toBeVisible();
    await expect(page.locator("[data-calendar-list-entry]")).toHaveCount(plan.entries.length);

    const firstWeek = await page.locator("[data-calendar-week]").getAttribute("data-calendar-week");
    await page.getByRole("button", { name: "Next week" }).click();
    await expect(page.locator("[data-calendar-week]")).not.toHaveAttribute("data-calendar-week", firstWeek!);
    await expect(page).toHaveURL(/week=\d{4}-\d{2}-\d{2}/u);
    await page.goBack();
    await expect(page.locator("[data-calendar-week]")).toHaveAttribute("data-calendar-week", firstWeek!);

    await page.getByRole("tab", { name: "Month" }).click();
    await expect(page.locator("[data-calendar-month]")).toBeVisible();
    await expect(page).toHaveURL(/view=month/u);
    await page.locator(`[data-calendar-month-day="${plan.period!.start}"] button`).click();
    await expect(page.locator('[role="grid"][data-calendar-week]')).toBeVisible();

    const axe = await new AxeBuilder({ page }).include(`[data-marketing-calendar="${venture}"]`).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.filter(({ impact }) => impact === "serious" || impact === "critical").map(({ id, nodes }) => `${id}: ${nodes[0]?.target}`)).toEqual([]);
    expect(attempted).toEqual([]);
  });
}

test("an entry opens from the grid, steps to the next and is deep-linkable", async ({ page }) => {
  const attempted = await guardMutations(page);
  await page.goto("/admin/calendar?venture=marketingshark", { waitUntil: "networkidle" });
  const chip = page.locator("[data-calendar-entry]").first();
  const id = await chip.getAttribute("data-calendar-entry");
  await chip.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(`[data-calendar-detail="${id}"]`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`entry=${id}`, "u"));
  await dialog.getByRole("button", { name: "Next entry" }).click();
  await expect(dialog.locator(`[data-calendar-detail="${id}"]`)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).not.toHaveURL(/entry=/u);

  await page.goto(`/admin/calendar?venture=marketingshark&entry=${id}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("dialog").locator(`[data-calendar-detail="${id}"]`)).toBeVisible();
  expect(attempted).toEqual([]);
});

test("arrow keys walk the week grid and Enter opens the focused entry", async ({ page }) => {
  await guardMutations(page);
  await page.goto("/admin/calendar?venture=marketingshark", { waitUntil: "networkidle" });
  const first = page.locator('[data-calendar-entry][tabindex="0"]');
  await expect(first).toHaveCount(1);
  await first.focus();
  const start = await first.getAttribute("data-calendar-entry");
  await page.keyboard.press("ArrowDown");
  const moved = await page.evaluate(() => document.activeElement?.getAttribute("data-calendar-entry"));
  expect(moved).toBeTruthy();
  expect(moved).not.toBe(start);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog").locator(`[data-calendar-detail="${moved}"]`)).toBeVisible();
});

test("the complete plan filters through the query string", async ({ page }) => {
  await guardMutations(page);
  const plan = plans["caught-up"];
  const threads = plan.entries.filter((entry) => entry.platform === "threads").length;
  await page.goto("/admin/calendar?venture=caught-up", { waitUntil: "networkidle" });
  await page.locator('[data-calendar-filter="platform"]').selectOption("threads");
  await expect(page).toHaveURL(/platform=threads/u);
  await expect(page.locator("[data-calendar-list-entry]")).toHaveCount(threads);
  await expect(page.locator('[data-calendar-list-entry]:not([data-platform="threads"])')).toHaveCount(0);

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("[data-calendar-list-entry]")).toHaveCount(threads);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("[data-calendar-list-entry]")).toHaveCount(plan.entries.length);

  await page.getByLabel("Search").fill("zzzz-no-such-entry");
  await expect(page.getByText("No matches", { exact: true })).toBeVisible();
});

test("the venture workspaces carry the same calendar without the switch", async ({ page }) => {
  await guardMutations(page);
  await page.goto("/admin?venture=caught-up&tab=calendar", { waitUntil: "networkidle" });
  await expect(page.locator('[data-marketing-calendar="caught-up"]')).toBeVisible();
  await expect(page.locator("[data-calendar-venture-switch]")).toHaveCount(0);
});

test("the calendar stays inside a 390px phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/calendar?venture=caught-up", { waitUntil: "networkidle" });
  await expect(page.locator('[data-marketing-calendar="caught-up"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
