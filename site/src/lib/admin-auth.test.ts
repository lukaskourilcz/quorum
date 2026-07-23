import { describe, expect, it } from "vitest";
import { verifyBasicAuthorization } from "./admin-auth";

describe("admin authorization", () => {
  it("fails closed when credentials are not configured", () => {
    expect(verifyBasicAuthorization(null, undefined, undefined)).toBe(
      "missing_config"
    );
  });

  it("uses both username and password", () => {
    const valid = `Basic ${Buffer.from("operator:correct").toString("base64")}`;
    const invalid = `Basic ${Buffer.from("operator:wrong").toString("base64")}`;
    expect(verifyBasicAuthorization(valid, "operator", "correct")).toBe("ok");
    expect(verifyBasicAuthorization(invalid, "operator", "correct")).toBe(
      "denied"
    );
  });
});
