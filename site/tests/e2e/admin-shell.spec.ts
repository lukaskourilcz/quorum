import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const adminDestinations = [
  "/admin",
  "/admin/operations",
  "/admin/implementation-plans",
  "/admin/social-profiles",
  "/admin?view=approvals",
  "/admin?view=manual-tasks",
  "/admin?view=future",
  "/admin?venture=carousel-studio",
  "/admin?venture=caught-up",
  "/admin?venture=titty-tuesdays",
  "/admin?venture=goviral",
  "/admin?venture=booksofhistory",
  "/admin?venture=fightaiq",
  "/admin?venture=marketingshark",
  "/admin?venture=mma-files",
  "/admin?venture=door-money",
  "/admin?venture=tehdejsi-svet",
  "/admin?venture=kvorum",
  "/admin?venture=personal-growth"
] as const;

test("desktop Admin shell keeps its window, scroll, preferences and real command destinations", async ({ page }) => {
  await page.goto("/admin", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { level: 1, name: "Company Overview." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin destinations" })).toBeVisible();
  await expect(page.locator("[data-admin-window-controls] span")).toHaveCount(3);
  await expect(page.locator("[data-admin-sidebar]")).toHaveCSS("width", "224px");
  await expect(page.locator("[data-admin-hydrated]")).toHaveAttribute("data-admin-hydrated", "true");
  expect(await page.evaluate(() => ({
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    contentScrolls: document.querySelector<HTMLElement>("[data-admin-content]")!.scrollHeight
      > document.querySelector<HTMLElement>("[data-admin-content]")!.clientHeight,
    horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth
  }))).toEqual({ documentHeight: 900, viewportHeight: 900, contentScrolls: true, horizontalOverflow: 0 });

  await page.getByRole("button", { name: "Collapse Admin sidebar" }).click();
  await expect(page.locator("[data-admin-sidebar]")).toHaveCSS("width", "64px");
  await expect(page.locator("[data-admin-window]").locator("..")).toHaveAttribute("data-preference-pending", "false");
  await expect(page.locator("[data-admin-window-controls] span")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Company Overview", exact: true })).toHaveAttribute("aria-label", "Company Overview");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("[data-admin-sidebar]")).toHaveCSS("width", "64px");

  await page.getByRole("button", { name: "Use dark Admin theme" }).click();
  await expect(page.locator("[data-admin-window]").locator("..")).toHaveAttribute("data-admin-theme", "dark");
  await expect(page.locator("[data-admin-window]").locator("..")).toHaveAttribute("data-preference-pending", "false");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("[data-admin-window]").locator("..")).toHaveAttribute("data-admin-theme", "dark");

  const palette = page.getByRole("dialog", { name: "Admin navigation" });
  // A reload can paint the server-rendered shell just before the command palette's keyboard
  // listener hydrates. Retry only while the visible dialog is absent so a successful shortcut is
  // never toggled closed and the assertion remains tied to user-visible state.
  await expect.poll(async () => {
    if (await palette.isVisible()) return true;
    await page.keyboard.press("ControlOrMeta+K");
    return palette.isVisible();
  }, { timeout: 30_000 }).toBe(true);
  await palette.getByRole("searchbox", { name: "Search Admin destinations" }).fill("kvorum");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await palette.getByRole("searchbox", { name: "Search Admin destinations" }).press("Enter");
  await expect(page).toHaveURL(/\/admin\?venture=kvorum$/);
  await expect(page.getByRole("link", { name: "Kvórum", exact: true })).toHaveAttribute("aria-current", "page");
});

test("mobile Admin navigation has safe targets and exposes every live destination", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin", { waitUntil: "networkidle" });

  await expect(page.locator("[data-admin-sidebar]")).toBeHidden();
  const mobileNav = page.getByRole("navigation", { name: "Primary Admin navigation" });
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.locator("a,button")).toHaveCount(4);
  expect(await mobileNav.locator("a,button").evaluateAll((targets) => targets.map((target) => ({
    height: target.getBoundingClientRect().height,
    width: target.getBoundingClientRect().width
  })))).toEqual(expect.arrayContaining([
    expect.objectContaining({ height: expect.any(Number), width: expect.any(Number) })
  ]));
  for (const box of await mobileNav.locator("a,button").evaluateAll((targets) => targets.map((target) => target.getBoundingClientRect().toJSON()))) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  await expect(mobileNav).toHaveAttribute("data-personal-growth-workspace", "available");

  await mobileNav.getByRole("button", { name: "More" }).click();
  const more = page.getByRole("dialog", { name: "More" });
  await expect(more).toBeVisible();
  expect(await more.locator('a[href^="/admin"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(adminDestinations);
  await expect(more.getByRole("button", { name: "Sign out of Admin" })).toBeVisible();
  await expect(more.getByRole("link", { name: "Public" })).toHaveAttribute("href", "/");

  await more.getByRole("button", { name: "Close" }).click();
  await mobileNav.getByRole("button", { name: "Workspaces" }).click();
  const workspaces = page.getByRole("dialog", { name: "Workspaces" });
  await expect(workspaces).toBeVisible();
  await expect(workspaces.getByRole("link", { name: /Kvórum/ })).toHaveAttribute("href", "/admin?venture=kvorum");
  await expect(workspaces.getByRole("link", { name: "Lukáš Growth Desk" })).toHaveAttribute("href", "/admin?venture=personal-growth");
});

test("new Admin shell chrome and mobile sheet pass the accessibility gate", async ({ page }) => {
  await page.goto("/admin", { waitUntil: "networkidle" });
  const desktop = await new AxeBuilder({ page })
    .include("[data-admin-sidebar]")
    .include("[data-admin-toolbar]")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(desktop.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("navigation", { name: "Primary Admin navigation" }).getByRole("button", { name: "More" }).click();
  const mobile = await new AxeBuilder({ page })
    .include("[data-admin-mobile-nav]")
    .include("[data-dialog-root]")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(mobile.violations).toEqual([]);
});
