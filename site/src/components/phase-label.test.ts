import { describe, expect, it } from "vitest";
import { formatPhaseLabel } from "./phase-label";

describe("Phase labels", () => {
  it("labels the days, the shifts that were retired and the historical AM/PM records", () => {
    expect(formatPhaseLabel("cu-day")).toBe("DNESKAi daily desk");
    expect(formatPhaseLabel("mma-day")).toBe("MMA Files daily desk");
    expect(formatPhaseLabel("dm-day")).toBe("Door Money daily desk");
    expect(formatPhaseLabel("morning")).toBe("Morning company meeting");
    // Retired, and still named: their records are on file and a reader still opens them.
    expect(formatPhaseLabel("afternoon")).toBe("Afternoon company meeting");
    expect(formatPhaseLabel("night")).toBe("Night company meeting");
    expect(formatPhaseLabel("cu-edition")).toBe("DNESKAi edition production");
    expect(formatPhaseLabel("cu-product")).toBe("DNESKAi product meeting");
    expect(formatPhaseLabel("founding")).toBe("Founding");
    expect(formatPhaseLabel("am")).toBe("Morning meeting · old label");
    expect(formatPhaseLabel("pm")).toBe("Afternoon meeting · old label");
  });
});
