import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  captureAdminRuntimeFailures,
  expectNoDocumentOverflow,
  guardAdminWrites,
  setAdminPreferences
} from "./admin-qa";

interface VentureRegistry {
  ventures: Array<{ id: string }>;
}

const registry = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "../config/ventures.json"), "utf8")
) as VentureRegistry;
const canonicalDestinations = [
  "/admin",
  "/admin?view=approvals",
  "/admin?view=manual-tasks",
  "/admin?view=future",
  "/admin?venture=carousel-studio",
  ...registry.ventures
    .filter(({ id }) => id !== "carousel-studio")
    .map(({ id }) => `/admin?venture=${id}`)
];

async function expectCanonicalLinks(links: Locator) {
  expect(await links.evaluateAll((items) =>
    items.map((item) => item.getAttribute("href"))
  )).toEqual(canonicalDestinations);
}

async function openAdmin(page: Page, route = "/admin") {
  const failures = captureAdminRuntimeFailures(page);
  const mutationAttempts = await guardAdminWrites(page);
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("[data-admin-content]")).toBeVisible();
  return { failures, mutationAttempts };
}

test("expanded and collapsed desktop navigation expose every canonical destination", async ({
  page
}) => {
  await setAdminPreferences(page, { theme: "light" });
  const runtime = await openAdmin(page);
  const navigation = page.getByRole("navigation", {
    name: "Admin destinations"
  });
  const links = navigation.locator('a[href^="/admin"]');

  await expectCanonicalLinks(links);
  await expect(links).toHaveCount(canonicalDestinations.length);

  await navigation.locator('a[href="/admin?view=approvals"]').click();
  await expect(page).toHaveURL(/\/admin\?view=approvals$/u);
  await expect(
    navigation.locator('a[href="/admin?view=approvals"][aria-current="page"]')
  ).toBeVisible();
  expect(runtime.failures).toEqual([]);
  expect(runtime.mutationAttempts).toEqual([]);

  await setAdminPreferences(page, { collapsed: true, theme: "dark" });
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-admin-sidebar]")).toHaveCSS("width", "64px");
  await expectCanonicalLinks(links);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("aria-label", /\S/u);
  }
  await expectNoDocumentOverflow(page, "collapsed canonical navigation");
  expect(runtime.failures).toEqual([]);
  expect(runtime.mutationAttempts).toEqual([]);
});

test("the command palette exposes every destination and opens the active workspace", async ({
  page
}) => {
  await setAdminPreferences(page, { theme: "dark" });
  const runtime = await openAdmin(page);
  await page.getByRole("button", { name: "Search Admin" }).click();

  const palette = page.getByRole("dialog", { name: "Admin navigation" });
  await expect(palette).toBeVisible();
  await expectCanonicalLinks(palette.getByRole("option"));
  const search = palette.getByRole("searchbox", {
    name: "Search Admin destinations"
  });
  await search.fill("kvorum");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await search.press("Enter");

  await expect(page).toHaveURL(/\/admin\?venture=kvorum$/u);
  await expect(
    page.locator('a[href="/admin?venture=kvorum"][aria-current="page"]')
  ).toBeVisible();
  expect(runtime.failures).toEqual([]);
  expect(runtime.mutationAttempts).toEqual([]);
});

test("mobile More keeps safe targets and exposes every canonical destination", async ({
  page
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await setAdminPreferences(page, { theme: "light" });
  const runtime = await openAdmin(page);
  const mobileNavigation = page.getByRole("navigation", {
    name: "Primary Admin navigation"
  });

  await expect(page.locator("[data-admin-sidebar]")).toBeHidden();
  const targets = mobileNavigation.locator("a,button");
  await expect(targets).toHaveCount(4);
  for (const target of await targets.all()) {
    const box = await target.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }

  await mobileNavigation.getByRole("button", { name: "More" }).click();
  const more = page.getByRole("dialog", { name: "More" });
  await expectCanonicalLinks(more.locator('a[href^="/admin"]'));
  await more.locator('a[href="/admin?venture=tehdejsi-svet"]').click();

  await expect(page).toHaveURL(/\/admin\?venture=tehdejsi-svet$/u);
  await expect(
    mobileNavigation.getByRole("button", { name: "Workspaces" })
  ).toHaveAttribute("data-active", "true");
  await mobileNavigation.getByRole("button", { name: "More" }).click();
  await expect(
    page.getByRole("dialog", { name: "More" }).locator(
      'a[href="/admin?venture=tehdejsi-svet"][aria-current="page"]'
    )
  ).toBeVisible();
  await expectNoDocumentOverflow(page, "mobile canonical navigation");
  expect(runtime.failures).toEqual([]);
  expect(runtime.mutationAttempts).toEqual([]);
});

test("keyboard users can skip, enter, remain within and leave Admin dialogs", async ({
  page
}) => {
  await setAdminPreferences(page, { theme: "light" });
  const runtime = await openAdmin(page);

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to Admin content" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#admin-content")).toBeFocused();

  const searchButton = page.getByRole("button", { name: "Search Admin" });
  await searchButton.focus();
  await page.keyboard.press("Enter");
  const palette = page.getByRole("dialog", { name: "Admin navigation" });
  const search = palette.getByRole("searchbox", {
    name: "Search Admin destinations"
  });
  await expect(search).toBeFocused();

  const lastOption = palette.getByRole("option").last();
  await lastOption.focus();
  await page.keyboard.press("Tab");
  await expect(palette.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(lastOption).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(searchButton).toBeFocused();

  await page.keyboard.press("ControlOrMeta+K");
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  expect(runtime.failures).toEqual([]);
  expect(runtime.mutationAttempts).toEqual([]);
});

test("the mobile sheet traps focus, restores its opener and restores body scroll", async ({
  page
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await setAdminPreferences(page, { theme: "dark" });
  const runtime = await openAdmin(page);
  await page.evaluate(() => {
    document.body.style.overflow = "clip";
  });

  const moreButton = page.getByRole("navigation", {
    name: "Primary Admin navigation"
  }).getByRole("button", { name: "More" });
  await moreButton.click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");

  const lastFocusable = sheet.getByRole("button", {
    name: "Sign out of Admin"
  });
  await lastFocusable.focus();
  await page.keyboard.press("Tab");
  await expect(sheet.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(sheet).toBeHidden();
  await expect(moreButton).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("clip");
  expect(runtime.failures).toEqual([]);
  expect(runtime.mutationAttempts).toEqual([]);
});
