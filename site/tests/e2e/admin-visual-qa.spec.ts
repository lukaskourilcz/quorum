import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  ADMIN_THEMES,
  ADMIN_VIEWPORTS,
  captureAdminRuntimeFailures,
  expectNoDocumentOverflow,
  guardAdminWrites,
  setAdminPreferences
} from "./admin-qa";

const snapshotStyle = path.resolve(
  process.cwd(),
  "tests/e2e/admin-shell-snapshot.css"
);

test("Admin QA uses a protected, noindex production boundary without mutations", async ({
  browser,
  page
}, testInfo) => {
  const mutationAttempts = await guardAdminWrites(page);

  const response = await page.goto("/admin", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["x-robots-tag"]).toBe(
    "noindex, nofollow, noarchive"
  );
  expect(response?.headers()["content-security-policy"]).not.toContain(
    "'unsafe-eval'"
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/u
  );
  expect(mutationAttempts).toEqual([]);

  const baseURL = String(testInfo.project.use.baseURL);
  const guest = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] }
  });
  const guestPage = await guest.newPage();
  const guestResponse = await guestPage.goto("/admin", {
    waitUntil: "domcontentloaded"
  });
  await expect(guestPage).toHaveURL(/\/admin\/login\?error=expired/u);
  expect(guestResponse?.headers()["x-robots-tag"]).toBe(
    "noindex, nofollow, noarchive"
  );
  await guest.close();
});

for (const viewport of ADMIN_VIEWPORTS) {
  for (const theme of ADMIN_THEMES) {
    test(`${theme} Admin geometry is contained at ${viewport.width}px`, async ({
      page
    }) => {
      await page.setViewportSize(viewport);
      await setAdminPreferences(page, { theme });
      const failures = captureAdminRuntimeFailures(page);
      const mutationAttempts = await guardAdminWrites(page);

      const response = await page.goto("/admin", {
        waitUntil: "domcontentloaded"
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("[data-admin-content]")).toBeVisible();
      await expect(page.locator("[data-admin]").first()).toHaveAttribute(
        "data-admin-theme",
        theme
      );

      const geometry = await page.evaluate(() => {
        const bounds = (selector: string) => {
          const rect = document
            .querySelector<HTMLElement>(selector)!
            .getBoundingClientRect();
          return {
            height: rect.height,
            width: rect.width,
            x: rect.x,
            y: rect.y
          };
        };
        const sidebar = document.querySelector<HTMLElement>(
          "[data-admin-sidebar]"
        )!;
        const mobile = document.querySelector<HTMLElement>(
          "[data-admin-mobile-nav]"
        )!;
        return {
          contentOverflowY: getComputedStyle(
            document.querySelector<HTMLElement>("[data-admin-content]")!
          ).overflowY,
          documentHeight: document.documentElement.scrollHeight,
          mobileDisplay: getComputedStyle(mobile).display,
          sidebar: bounds("[data-admin-sidebar]"),
          sidebarDisplay: getComputedStyle(sidebar).display,
          toolbar: bounds("[data-admin-toolbar]"),
          window: bounds("[data-admin-window]")
        };
      });

      expect(geometry.toolbar.height).toBe(52);
      if (viewport.width >= 768) {
        expect(geometry.window).toEqual({
          height: viewport.height - 40,
          width: viewport.width - 60,
          x: 30,
          y: 20
        });
        expect(geometry.sidebarDisplay).toBe("flex");
        expect(geometry.sidebar.width).toBe(224);
        expect(geometry.mobileDisplay).toBe("none");
        expect(geometry.documentHeight).toBe(viewport.height);
        expect(geometry.contentOverflowY).toBe("auto");
      } else {
        expect(geometry.window.x).toBe(0);
        expect(geometry.window.y).toBe(0);
        expect(geometry.window.width).toBe(viewport.width);
        expect(geometry.sidebarDisplay).toBe("none");
        expect(geometry.mobileDisplay).toBe("grid");
      }

      await expectNoDocumentOverflow(
        page,
        `${theme} Admin at ${viewport.width}px`
      );
      expect(failures).toEqual([]);
      expect(mutationAttempts).toEqual([]);
    });
  }
}

test("the collapsed desktop rail keeps the 64px geometry", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await setAdminPreferences(page, { collapsed: true, theme: "dark" });
  await page.goto("/admin", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-admin-sidebar]")).toHaveCSS("width", "64px");
  await expect(page.locator("[data-admin-window-controls] span")).toHaveCount(0);
  await expect(
    page.getByRole("link", { exact: true, name: "Company Overview" })
  ).toHaveAttribute("aria-label", "Company Overview");
  await expectNoDocumentOverflow(page, "collapsed dark Admin at 1440px");
});

for (const sample of [
  {
    label: "long labels and owner controls",
    route: "/admin?venture=fightaiq&tab=fighters",
    text: "unresolved"
  },
  {
    label: "technical identifiers",
    route: "/admin?venture=tehdejsi-svet&tab=library",
    text: "Envelope hash"
  },
  {
    label: "money values",
    route: "/admin",
    text: "$50.00"
  },
  {
    label: "dense tables",
    region: "Hook libraries",
    route: "/admin?venture=carousel-studio&tab=hooks",
    text: "Libraries"
  }
] as const) {
  test(`${sample.label} remain contained at 360px`, async ({ page }) => {
    await page.setViewportSize({ height: 800, width: 360 });
    await setAdminPreferences(page, { theme: "dark" });
    await page.goto(sample.route, { waitUntil: "domcontentloaded" });

    await expect(page.getByText(sample.text, { exact: false }).first()).toBeVisible();
    if ("region" in sample) {
      await expect(
        page.getByRole("region", { name: sample.region })
      ).toHaveAttribute("tabindex", "0");
    }
    await expectNoDocumentOverflow(page, sample.route);
  });
}

for (const snapshot of [
  {
    collapsed: false,
    name: "admin-shell-desktop-light.png",
    theme: "light" as const,
    viewport: { height: 900, width: 1440 }
  },
  {
    collapsed: true,
    name: "admin-shell-desktop-dark-collapsed.png",
    theme: "dark" as const,
    viewport: { height: 900, width: 1440 }
  },
  {
    collapsed: false,
    name: "admin-shell-mobile-dark.png",
    theme: "dark" as const,
    viewport: { height: 844, width: 390 }
  }
]) {
  test(`stable shell landmarks match ${snapshot.name}`, async ({ page }) => {
    await page.setViewportSize(snapshot.viewport);
    await setAdminPreferences(page, snapshot);
    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(page).toHaveScreenshot(snapshot.name, {
      stylePath: snapshotStyle
    });
  });
}

test("reduced motion removes non-essential Admin transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setAdminPreferences(page, { theme: "light" });
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Search Admin" }).click();

  const motion = await page.evaluate(() => {
    const values = (selector: string) => {
      const style = getComputedStyle(document.querySelector<HTMLElement>(selector)!);
      return {
        animationDuration: style.animationDuration,
        animationIterationCount: style.animationIterationCount,
        transitionDuration: style.transitionDuration
      };
    };
    return {
      backdrop: values("[data-dialog-backdrop]"),
      shell: values("[data-admin-window]"),
      surface: values("[data-dialog-surface]")
    };
  });

  for (const value of Object.values(motion)) {
    const milliseconds = (duration: string) =>
      Math.max(
        ...duration.split(",").map((part) => {
          const value = Number.parseFloat(part);
          return part.trim().endsWith("ms") ? value : value * 1_000;
        })
      );
    expect(milliseconds(value.animationDuration)).toBeLessThanOrEqual(0.01);
    expect(value.animationIterationCount).toBe("1");
    expect(milliseconds(value.transitionDuration)).toBeLessThanOrEqual(0.01);
  }
});
