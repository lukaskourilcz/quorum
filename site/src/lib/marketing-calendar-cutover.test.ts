import { describe, expect, it } from "vitest";
import { marketingCalendarDestination } from "./marketing-calendar-cutover";

describe("verified marketing calendar cutover", () => {
  it("holds the existing calendar until a verified cutover and destination are configured", () => {
    expect(marketingCalendarDestination("caught-up", {})).toBeNull();
    expect(marketingCalendarDestination("caught-up", { OWN_DASHBOARD_MARKETING_CALENDAR_URL: "https://own.example/marketing" })).toBeNull();
    expect(marketingCalendarDestination("caught-up", { OWN_DASHBOARD_MARKETING_CUTOVER_VERIFIED: "true" })).toBeNull();
  });
  it("keeps each brand explicit on the destination", () => {
    const env = { OWN_DASHBOARD_MARKETING_CUTOVER_VERIFIED: "true", OWN_DASHBOARD_MARKETING_CALENDAR_URL: "https://own.example/marketing" };
    expect(marketingCalendarDestination("caught-up", env)).toBe("https://own.example/marketing?brand=dneskai");
    expect(marketingCalendarDestination("marketingshark", env)).toBe("https://own.example/marketing?brand=devshark");
  });
  it("rejects unsafe destination schemes and credentials", () => {
    for (const url of ["http://own.example/marketing", "https://user:password@own.example/marketing", "javascript:alert(1)"]) {
      expect(marketingCalendarDestination("caught-up", { OWN_DASHBOARD_MARKETING_CUTOVER_VERIFIED: "true", OWN_DASHBOARD_MARKETING_CALENDAR_URL: url })).toBeNull();
    }
  });
});
