import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { pendingApprovalCount, readApprovedUndeliveredPayloads } from "./admin-owner-attention";

describe("owner attention", () => {
  it("counts only unchecked approval records", () => {
    expect(pendingApprovalCount("- [ ] HUMAN_APPROVAL OPEN-001\n- [x] HUMAN_APPROVAL DONE-001\nHUMAN_APPROVAL in prose")).toBe(1);
  });

  it("surfaces an approved banner that remains staged without a receipt", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "owner-attention-"));
    const contract = path.join(root, "state", "ventures", "marketingshark", "banner", "contract.json");
    await mkdir(path.dirname(contract), { recursive: true });
    await writeFile(contract, JSON.stringify({
      schemaVersion: "marketingshark-banner/1", brandId: "devshark", status: "staged", receiptRef: null
    }));

    await expect(readApprovedUndeliveredPayloads(root)).resolves.toEqual(["devshark banner"]);
  });
});
