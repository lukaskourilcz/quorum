import { describe, expect, it } from "vitest";
import { meetingFixtures } from "./meeting-fixtures";

describe("public JSON projection", () => {
  it("contains no prompt contracts, queue contents, or credential key names", () => {
    const publicJson = JSON.stringify({ meetingFixtures });
    expect(publicJson).not.toMatch(/(?:systemPrompt|developerMessage|promptContract|queueContents|apiKey|privateKey|RESEND_API_KEY|DELIVERY_APP_PRIVATE_KEY)/i);
  });
});
