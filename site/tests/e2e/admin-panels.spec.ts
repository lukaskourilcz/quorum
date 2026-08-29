import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { ADMIN_THEME_COOKIE } from "../../src/lib/admin-shell-preferences";

interface VentureRegistry {
  ventures: Array<{ id: string; adminTabs: string[] }>;
}

const registry = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "../config/ventures.json"), "utf8"),
) as VentureRegistry;
const registeredTabs = registry.ventures.flatMap((venture) =>
  venture.adminTabs.map((tab) => ({
    venture: venture.id,
    tab,
    route: `/admin?venture=${venture.id}&tab=${tab}`,
  })),
);

test("every tab in the live venture registry remains a reachable Admin destination", async ({ page }) => {
  test.setTimeout(600_000);

  for (const destination of registeredTabs) {
    const response = await page.goto(destination.route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), destination.route).toBeLessThan(400);
    await expect(page.locator("[data-admin-content]")).toBeVisible();
    await expect(page.locator(`a[href="${destination.route}"][aria-current="page"]`)).toBeVisible();
    await expect(page.getByText("The project desk could not load.", { exact: true })).toHaveCount(0);
  }
});

const responsiveRoutes = [
  // The bare overview, which the list used to skip. It is the first screen the owner sees and it
  // now carries the launch board's eight-column table, so it is the surface most likely to widen
  // the document on a phone.
  "/admin",
  "/admin?venture=global",
  "/admin?venture=booksofhistory&tab=features",
  "/admin?venture=mma-files&tab=banners",
  "/admin?venture=carousel-studio&tab=hooks",
  "/admin?venture=carousel-studio&tab=studio",
  "/admin?venture=kvorum&tab=recommendations",
] as const;

for (const route of responsiveRoutes) {
  test(`migrated Admin panel is contained and WCAG AA at 390px — ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("[data-admin-content]")).toBeVisible();

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
          text: element.textContent?.trim().slice(0, 80),
        })),
    }));
    expect(viewport.scrollWidth - viewport.clientWidth, `${route} widens the document`).toBeLessThanOrEqual(1);
    expect(viewport.offenders, `${route} has uncontained content`).toEqual([]);

    const accessibility = await new AxeBuilder({ page })
      .include("[data-admin-content]")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });
}

test("standalone protected files inherit the saved Admin theme and remain contained", async ({ page }) => {
  await page.context().addCookies([{
    domain: "localhost",
    name: ADMIN_THEME_COOKIE,
    path: "/admin",
    sameSite: "Strict",
    secure: false,
    value: "dark",
  }]);
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto(
    "/admin/files/ideas/titty-tuesdays/details/idea-2026-08-05-415cf2b0.md",
    { waitUntil: "domcontentloaded" },
  );

  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { level: 1, name: "Detailed notes" })).toBeVisible();
  await expect(page.locator("[data-admin]").first()).toHaveAttribute("data-admin-theme", "dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
});
