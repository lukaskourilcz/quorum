import { describe, expect, it } from "vitest";
import { sanitizeAdminReturnTo } from "./admin-return-to";

const BASE = "https://boardless.example/admin/login";

describe("the destination carried through login", () => {
  it("keeps a same-origin admin path with its query", () => {
    expect(sanitizeAdminReturnTo("/admin?venture=fightaiq&tab=slates", BASE))
      .toBe("/admin?venture=fightaiq&tab=slates");
    expect(sanitizeAdminReturnTo("/admin/ventures/titty-tuesdays/binder", BASE))
      .toBe("/admin/ventures/titty-tuesdays/binder");
  });

  it("refuses anything that would leave the site", () => {
    for (const candidate of [
      "https://evil.example/admin",
      "//evil.example/admin",
      "/\\evil.example/admin",
      "\\/evil.example",
      "javascript:alert(1)",
      "http://boardless.example/admin"
    ]) {
      expect(sanitizeAdminReturnTo(candidate, BASE)).toBeNull();
    }
  });

  it("refuses a path outside the admin", () => {
    expect(sanitizeAdminReturnTo("/", BASE)).toBeNull();
    expect(sanitizeAdminReturnTo("/results", BASE)).toBeNull();
    // A bare prefix match would let this through: it shares five characters and nothing else.
    expect(sanitizeAdminReturnTo("/administrator", BASE)).toBeNull();
    expect(sanitizeAdminReturnTo("/admin-secrets", BASE)).toBeNull();
  });

  it("refuses the login pages, which would loop or re-POST", () => {
    expect(sanitizeAdminReturnTo("/admin/login", BASE)).toBeNull();
    expect(sanitizeAdminReturnTo("/admin/login?error=expired", BASE)).toBeNull();
    expect(sanitizeAdminReturnTo("/admin/login/submit", BASE)).toBeNull();
  });

  it("refuses what is not a usable string", () => {
    for (const candidate of [undefined, null, "", 42, {}, "/admin".padEnd(600, "x")]) {
      expect(sanitizeAdminReturnTo(candidate, BASE)).toBeNull();
    }
  });
});
