import { describe, expect, it } from "vitest";
import { unfenceModelJson } from "../src/llm/call.js";
import { describeReplyShape } from "../src/llm/call.js";

describe("a fenced reply is still a reply", () => {
  it("unwraps the fence a model adds around its JSON", () => {
    // On 3 August VAULT answered the morning company meeting with a ```json block. Two call
    // sites stripped it and five did not, so JSON.parse threw on the backtick and the whole
    // board died on a reply that was correct apart from its wrapper — billed, nothing made.
    expect(JSON.parse(unfenceModelJson('```json\n{"verdict":"fresh"}\n```'))).toEqual({ verdict: "fresh" });
    expect(JSON.parse(unfenceModelJson('```\n{"verdict":"fresh"}\n```'))).toEqual({ verdict: "fresh" });
    expect(JSON.parse(unfenceModelJson('  ```JSON\n{"verdict":"fresh"}\n```  '))).toEqual({ verdict: "fresh" });
  });

  it("leaves an unfenced reply exactly as it was", () => {
    const plain = '{"verdict":"repeat"}';
    expect(unfenceModelJson(plain)).toBe(plain);
    // A body that merely contains backticks is not fenced and must not be touched.
    const withTicks = '{"summary":"the ``` marker"}';
    expect(unfenceModelJson(withTicks)).toBe(withTicks);
  });

  it("does not rescue a reply that is genuinely malformed", () => {
    expect(() => JSON.parse(unfenceModelJson("```json\nnot json at all\n```"))).toThrow();
  });
});

describe("what a reply looked like, without saying what it said", () => {
  it("separates a ceiling that was too small from a contract that was ignored", () => {
    // The two failures marketingShark could not tell apart for nineteen days. A cut-off reply
    // opens correctly and never closes; a chatty one never opens.
    const truncated = describeReplyShape('{"carousels":{"cs":{"slides":[{"role":"hook"');
    expect(truncated).toContain("opens with {");
    expect(truncated).toContain("does not close");

    const chatty = describeReplyShape('Here is the package you asked for:\n\n{"a":1}');
    expect(chatty).toContain('opens with "H"');

    const clean = describeReplyShape('{"a":1}');
    expect(clean).toContain("opens with {");
    expect(clean).toContain("closes with }");
  });

  it("reports a fence without needing the caller to care", () => {
    expect(describeReplyShape('```json\n{"a":1}\n```')).toContain("fenced");
    expect(describeReplyShape('{"a":1}')).toContain("unfenced");
  });

  it("never reproduces the reply", () => {
    // One opening character and a length. A record may say the model wrote prose; it may not say
    // what the prose was, which is the rule the whole guarded path keeps.
    const secret = "Absolutely! Here is the carousel copy you requested for devshark today.";
    const shape = describeReplyShape(secret);
    expect(shape).not.toContain("carousel");
    expect(shape).not.toContain("devshark");
    expect(shape).not.toContain("Absolutely");
    expect(shape).toContain(`${secret.length} chars`);
  });

  it("says so when there is nothing at all", () => {
    expect(describeReplyShape("   ")).toBe("empty reply");
  });
});
