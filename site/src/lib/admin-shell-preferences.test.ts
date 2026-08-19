import { describe, expect, it } from "vitest";
import {
  parseAdminRail,
  parseAdminShellPreferencePatch,
  parseAdminTheme
} from "./admin-shell-preferences";

describe("Admin shell preferences", () => {
  it("defaults unknown cookie values without widening the preference surface", () => {
    expect(parseAdminTheme(undefined)).toBe("light");
    expect(parseAdminTheme("sepia")).toBe("light");
    expect(parseAdminTheme("dark")).toBe("dark");
    expect(parseAdminRail(undefined)).toBe(false);
    expect(parseAdminRail("expanded")).toBe(false);
    expect(parseAdminRail("collapsed")).toBe(true);
  });

  it("accepts only the two bounded owner preferences", () => {
    expect(parseAdminShellPreferencePatch({ theme: "dark" })).toEqual({ theme: "dark" });
    expect(parseAdminShellPreferencePatch({ collapsed: true })).toEqual({ collapsed: true });
    expect(parseAdminShellPreferencePatch({ theme: "light", collapsed: false })).toEqual({
      theme: "light",
      collapsed: false
    });
    expect(parseAdminShellPreferencePatch({})).toBeNull();
    expect(parseAdminShellPreferencePatch({ theme: "system" })).toBeNull();
    expect(parseAdminShellPreferencePatch({ collapsed: "yes" })).toBeNull();
    expect(parseAdminShellPreferencePatch({ theme: "dark", publish: true })).toBeNull();
  });
});
