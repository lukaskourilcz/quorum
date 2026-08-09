"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";

/**
 * The footer's content, opened where the reader is.
 *
 * Every one of these links used to navigate to a page built in the previous design, so a reader
 * following "Privacy" from the office walkthrough lost the walkthrough and landed somewhere that
 * looked like a different site. The pages are not deleted — they are still the canonical URLs,
 * they are still in the sitemap and a deep link to one still resolves — but the footer opens
 * their substance in place.
 *
 * Rewritten short, and short is the hard part. Simplifying a disclosure must never weaken it: the
 * facts a reader is owed are all here, in fewer words rather than in gentler ones. Where the full
 * record is longer than a dialog should be, the dialog says the essential thing and links to it.
 */

export interface FooterFacts {
  /** The all-in monthly operating cap, in USD, from the countersigned budget decision. */
  capUsd: number;
  /** The month the ledger is currently reporting, and what it has spent on model calls. */
  month: string;
  monthlyUsd: number;
  /** The most recent recorded events, newest first. */
  updates: Array<{ at: string; title: string; detail: string }>;
}

type Topic = "rules" | "about" | "money" | "privacy" | "disclosure" | "updates";

const TITLES: Record<Topic, { title: string; eyebrow: string; href: string }> = {
  rules: { title: "The rules this company works under", eyebrow: "Rules", href: "/company#rules" },
  about: { title: "What this is", eyebrow: "About", href: "/company" },
  money: { title: "What it costs to run", eyebrow: "Money", href: "/results#money" },
  privacy: { title: "What is collected", eyebrow: "Privacy", href: "/privacy" },
  disclosure: { title: "What is written by software", eyebrow: "Disclosure", href: "/disclosure" },
  updates: { title: "What changed recently", eyebrow: "Updates", href: "/log" }
};

function Body({ topic, facts }: { topic: Topic; facts: FooterFacts }) {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  if (topic === "rules") {
    return (
      <>
        <p>Four rules hold, and nothing overrides them.</p>
        <ul>
          <li>
            No money moves without the owner. Agents may propose a purchase and record it; only a
            person pays for anything, opens an account, or approves an ad.
          </li>
          <li>
            Everything the company runs on costs at most {money.format(facts.capUsd)} a month, all
            in. That is a hard ceiling, not a target, and it covers models, media, hosting and
            tools together.
          </li>
          <li>
            A claim needs a source a reader can open. Where the evidence does not support a
            sentence, the sentence is dropped rather than softened.
          </li>
          <li>
            Nothing is published to a social account automatically. Posts are drafted and left for
            a person.
          </li>
        </ul>
      </>
    );
  }
  if (topic === "about") {
    return (
      <>
        <p>
          BoardlessAI is a company whose day-to-day work is done by software agents. They meet on a
          schedule, write, check each other and publish; a person sets the direction, holds the
          money and approves anything that reaches the outside world.
        </p>
        <p>
          It runs two magazines — DNESKAi, a daily story about AI, and MMA Files, a daily article
          about mixed martial arts — and a handful of smaller projects that support them.
        </p>
        <p>
          Everything it decides is written down in this repository as it happens, which is why the
          site can show you the meetings, the costs and the reasons rather than a summary of them.
        </p>
      </>
    );
  }
  if (topic === "money") {
    return (
      <>
        <p>
          Everything the company runs on has to fit inside {money.format(facts.capUsd)} a month,
          all in: model calls, media, hosting and tools together. The cap is set by a
          countersigned decision and code refuses to exceed it rather than warning about it.
        </p>
        <p>
          In {facts.month} the model calls have cost {money.format(facts.monthlyUsd)}.
        </p>
        <p>
          The full ledger — every call, what it was for and what it cost — is on the results page.
        </p>
      </>
    );
  }
  if (topic === "privacy") {
    return (
      <>
        <p>
          This site sets no cookies, runs no analytics and no advertising scripts, and asks you for
          nothing. There is no account to make and no form to fill in.
        </p>
        <p>
          The host serves the pages and keeps ordinary server logs, which include IP addresses, for
          its own operational purposes. Nothing about a visit is stored by this company.
        </p>
        <p>
          Following a link to a magazine, a source or a social platform takes you to a site with
          its own policy, which this one has no control over.
        </p>
      </>
    );
  }
  if (topic === "disclosure") {
    return (
      <>
        <p>
          Articles on this company&rsquo;s magazines are written by software, from evidence gathered
          and checked by software, and published without a person reading every sentence first.
          That is the whole of the disclosure and it is not qualified anywhere.
        </p>
        <p>
          Every article carries its sources. Photographs are licensed and credited; where a picture
          was generated rather than photographed, the alt text says so.
        </p>
        <p>
          Mistakes are corrected in place with the correction recorded, not edited away. Nothing
          here is sponsored, and nothing is paid for by anyone the writing is about.
        </p>
      </>
    );
  }
  return (
    <>
      <p>The most recent recorded events. The full dated list is on the updates page.</p>
      <ul>
        {facts.updates.map((entry) => (
          <li key={`${entry.at}-${entry.title}`}>
            <span className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-[#94949c]">
              {entry.at.slice(0, 10)}
            </span>{" "}
            {entry.title} — {entry.detail}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The footer's links, each opening its own dialog.
 *
 * Feeds are not in here: `/feed.xml`, `/decisions.xml` and `/feed.json` are files a reader hands
 * to another program, and wrapping a file in a dialog would break the one use it has.
 */
export function FooterDialogLinks({
  links,
  facts,
  className,
  linkClassName
}: {
  links: ReadonlyArray<{ topic: Topic; label: string }>;
  facts: FooterFacts;
  className?: string;
  linkClassName?: string;
}) {
  const [open, setOpen] = useState<Topic | null>(null);
  const meta = open ? TITLES[open] : null;

  return (
    <>
      <ul className={className}>
        {links.map((link) => (
          <li key={link.topic}>
            <button className={linkClassName} data-footer-dialog={link.topic} onClick={() => setOpen(link.topic)} type="button">
              {link.label}
            </button>
          </li>
        ))}
      </ul>
      <Dialog eyebrow={meta?.eyebrow ?? ""} onClose={() => setOpen(null)} open={open !== null} title={meta?.title ?? ""}>
        {open && meta ? (
          <div className="grid max-w-[70ch] gap-3.5 text-[14.5px] leading-[1.6] text-[#d4d4d8] [&_li]:leading-[1.55] [&_ul]:grid [&_ul]:gap-2.5 [&_ul]:pl-5 [&_ul]:[list-style:disc]">
            <Body facts={facts} topic={open} />
            {/* The page is still the canonical address, still in the sitemap and still a working
                deep link. The dialog is how the footer opens it, not a replacement for it. */}
            <p className="pt-1">
              <Link className="font-mono text-[11.5px] uppercase tracking-[0.1em] text-[#a1a1aa] underline decoration-[#3f3f46] underline-offset-4 hover:text-[#f4f4f5]" href={meta.href}>
                Open the full page ›
              </Link>
            </p>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
