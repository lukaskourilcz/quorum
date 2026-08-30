import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { failureCode } from "../src/delivery/cli.js";
import { DELIVERY_FAILURE_CODES, isDeliveryFailureCode } from "../src/delivery/outbox.js";
import { repoRoot } from "../src/paths.js";

/**
 * The delivery CLI is where a failing release meets the record it leaves behind.
 *
 * `--code` used to be cast straight to `DeliveryFailureCode`, so the cycle workflow's
 * `post_deploy_verification` — a code the type never listed — went into a receipt unexamined and
 * came back out of the sentence map as nothing at all. A failing delivery step is a bad moment to
 * invent vocabulary, and the recorded consequence was a public meeting page reading
 * "undefined The owner has the technical report."
 */
describe("the delivery CLI's failure codes", () => {
  it("knows every code the cycle workflow can send", async () => {
    const workflow = await readFile(path.join(repoRoot, ".github/workflows/cycle.yml"), "utf8");
    const sent = [...workflow.matchAll(/FAILURE_CODE=([a-z_]+)/gu)].map((match) => match[1]!);

    expect(sent.length).toBeGreaterThan(0);
    for (const code of new Set(sent)) {
      expect(isDeliveryFailureCode(code), `${code} is sent by cycle.yml`).toBe(true);
    }
  });

  it("refuses a code it does not know instead of recording it", () => {
    expect(() => failureCode("not_a_real_code")).toThrow(/--code must be one of/u);
    expect(failureCode("post_deploy_verification")).toBe("post_deploy_verification");
    expect(failureCode(undefined)).toBeUndefined();
  });

  it("lists exactly the codes the type declares", () => {
    expect([...DELIVERY_FAILURE_CODES].sort()).toEqual([
      "build_failed",
      "content_invalid",
      "hash_conflict",
      "post_deploy_verification",
      "push_rejected",
      "schema_invalid",
      "unreachable"
    ]);
  });
});
