import { describe, expect, it } from "vitest";
import { unfenceModelJson } from "../src/llm/call.js";

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
