import { describe, expect, it } from "vitest";
import { isJsxExpressionBody } from "../src/delivery/validate.js";
import { unwrapJsxExpressionBody } from "../src/edition/write.js";

/**
 * Schema validity is not renderability. A body wrapped in a top-level MDX expression is valid MDX
 * and a valid string, and it renders as a single text node: no headings, no links, no paragraphs,
 * with the markdown printed instead of rendered. It passed every gate and published unread.
 */
describe("an article body has to be markdown, not one MDX expression", () => {
  const wrapped = "{`\n## Nadpis\n\nText s [odkazem](https://example.com).\n`}";

  it("unwraps the shape the desk started emitting", () => {
    expect(unwrapJsxExpressionBody(wrapped)).toBe("## Nadpis\n\nText s [odkazem](https://example.com).");
  });

  it("restores a code span whose backtick closed the template early", () => {
    // This is the body that failed the magazine's build: the backticks around `httpx` ended the
    // template literal four paragraphs before the wrapper did.
    const body = "{`\nKnihovna přestala instalovat \\`httpx\\`.\n`}";
    expect(unwrapJsxExpressionBody(body)).toBe("Knihovna přestala instalovat `httpx`.");
  });

  it("leaves a body that was never wrapped exactly as it is", () => {
    const plain = "## Nadpis\n\nText s `httpx` a { levou závorkou v textu.\n";
    expect(unwrapJsxExpressionBody(plain)).toBe(plain);
  });

  it("refuses at the delivery boundary whatever the unwrapper did not catch", () => {
    expect(isJsxExpressionBody(wrapped)).toBe(true);
    expect(isJsxExpressionBody("  {someOtherExpression}\n")).toBe(true);
    expect(isJsxExpressionBody(unwrapJsxExpressionBody(wrapped))).toBe(false);
    expect(isJsxExpressionBody("## Nadpis\n\nText.\n")).toBe(false);
  });
});
