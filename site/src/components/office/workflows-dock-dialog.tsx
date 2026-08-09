"use client";

import { Dialog } from "@/components/ui/dialog";
import type { OfficeWorkflows } from "@/lib/office-workflows";

/**
 * The loading dock, in plain words.
 *
 * It used to open a seven-panel animation of a courier's morning — a sealed package, an allowlist,
 * a shelf, a checklist — written as a metaphor about a building that does not exist. The owner
 * could not tell from it what the dock actually is. It is one thing: the place a finished article
 * leaves the company, and the only place anything does.
 *
 * Nothing here is invented. The delivery below is the newest recorded receipt, and when there is
 * none the dialog says so rather than showing an empty frame.
 */
export function WorkflowsDockDialog({
  data,
  open,
  onClose
}: {
  data: OfficeWorkflows;
  open: boolean;
  onClose: () => void;
}) {
  const receipt = data.receipt;
  return (
    <Dialog eyebrow="The loading dock" onClose={onClose} open={open} title="Where finished work leaves">
      <div className="grid max-w-[68ch] gap-4 text-[14.5px] leading-[1.6] text-[#d4d4d8]">
        <p>
          The dock is the only way out of the building. Everything the company publishes passes
          through it, and nothing reaches a reader any other way.
        </p>
        <p>
          Two things flow through it, both of them articles: an edition to the DNESKAi magazine and
          an article to the MMA Files magazine. Each leaves as one sealed package addressed to one
          magazine, and each leaves a receipt behind saying what went and when.
        </p>
        <p>
          Nothing arrives here. The dock has no inbound bay, because nothing outside the company
          sends this floor work.
        </p>

        <div className="mt-1 rounded-[10px] border border-[#26262b] bg-[#0c0c0f] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">
            The latest delivery
          </p>
          {receipt ? (
            <p className="mt-2 text-[13.5px] leading-[1.55] text-[#d4d4d8]" data-dock-latest>
              An edition went to the DNESKAi magazine on {receipt.deliveredOn}, recorded as{" "}
              <span className="font-mono text-[12.5px] text-[#a1a1aa]">{receipt.packageRef}</span>.
            </p>
          ) : (
            <p className="mt-2 text-[13.5px] leading-[1.55] text-[#94949c]" data-dock-latest>
              Nothing has been delivered yet.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
