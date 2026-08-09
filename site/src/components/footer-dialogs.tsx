"use client";

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
  /** What the same ledger has spent since the company started. */
  cumulativeUsd: number;
  /** Fixed monthly costs the owner has recorded, if any. */
  fixedMonthlyUsd: number;
  /** How many meetings are on the public record. */
  meetingCount: number;
  /** The most recent recorded events, newest first. */
  updates: Array<{ at: string; title: string; detail: string; costUsd: number }>;
}

type Topic = "rules" | "about" | "money" | "privacy" | "disclosure" | "updates";

const TITLES: Record<Topic, { title: string; eyebrow: string }> = {
  rules: { title: "The rules this company works under", eyebrow: "Rules" },
  about: { title: "What this is", eyebrow: "About" },
  money: { title: "What it costs to run", eyebrow: "Money" },
  privacy: { title: "What is collected", eyebrow: "Privacy" },
  disclosure: { title: "What is written by software", eyebrow: "Disclosure" },
  updates: { title: "What changed recently", eyebrow: "Updates" }
};

function Body({ topic, facts }: { topic: Topic; facts: FooterFacts }) {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  if (topic === "rules") {
    return (
      <>
        <p>
          These hold whatever else is decided. They are written into the code that runs the
          company, not into a policy document, so breaking one stops a run rather than producing a
          warning nobody reads.
        </p>
        <ul>
          <li>
            <b>Only a person spends money.</b> An agent may propose a purchase and record what it
            would cost; paying for anything, opening an account, buying a domain or approving an ad
            is the owner&rsquo;s alone. The same goes for credentials, contracts and anything
            legal.
          </li>
          <li>
            <b>{money.format(facts.capUsd)} a month, all in.</b> Model calls, images, hosting and
            tools together. A call that would take the month past the ceiling does not happen — the
            budget guard refuses it before the request is sent, and a day has its own smaller
            limit so one bad morning cannot spend the month.
          </li>
          <li>
            <b>Evidence before prose.</b> Every article is written from a packet of sources
            gathered first, and a sentence the packet does not support is dropped rather than
            hedged. Figures, dates, names and quotes may only come from the packet.
          </li>
          <li>
            <b>Nothing posts itself.</b> Social copy is drafted and left in a queue. Publishing
            needs a channel to be enabled, a kill switch to be off and an explicit approval, and
            all three are currently closed.
          </li>
          <li>
            <b>Corrections are recorded, not tidied away.</b> A published thing that turns out to
            be wrong is corrected in place with the correction kept beside it.
          </li>
          <li>
            <b>No vanity numbers.</b> Where a measure cannot honestly be taken it reads &ldquo;not
            measurable yet&rdquo; rather than zero, and no target is chosen because it is easy to
            hit.
          </li>
        </ul>
      </>
    );
  }
  if (topic === "about") {
    return (
      <>
        <p>
          BoardlessAI is a small company whose day-to-day work is done by AI agents. They meet on a
          fixed schedule, decide, write, check each other and publish. A person sets the direction,
          holds the money and approves anything that reaches the outside world.
        </p>
        <p>
          It publishes two Czech magazines. <b>DNESKAi</b> puts out one story a day about
          artificial intelligence, or records why there was nothing worth publishing.{" "}
          <b>MMA Files</b> puts out a daily article about mixed martial arts, written only from
          fighter records that have already been verified.
        </p>
        <p>
          Around them sit the projects that make them possible: a fight-data desk, a design lab
          that renders every carousel without calling a model, a trend scout, and two teaching
          products. Forty-two roles in total, most of them dormant on any given day.
        </p>
        <p>
          {facts.meetingCount > 0 ? <>{facts.meetingCount} meetings are on the public record. </> : null}
          Everything the company decides is written into its repository as it happens, which is why
          this site can show you the meetings, the costs and the reasons rather than a summary of
          them.
        </p>
        <p>
          It is an experiment, and it says so. There is no legal company, no customer and no
          revenue; the name is a working title that has not been cleared.
        </p>
      </>
    );
  }
  if (topic === "money") {
    return (
      <>
        <p>
          Everything the company runs on has to fit inside {money.format(facts.capUsd)} a month,
          all in: model calls, images, hosting and tools together. The ceiling comes from a
          countersigned decision and the code refuses to exceed it rather than warning about it.
        </p>
        <ul>
          <li>
            Model calls in {facts.month}: <b>{money.format(facts.monthlyUsd)}</b>.
          </li>
          <li>
            Model calls since the beginning: <b>{money.format(facts.cumulativeUsd)}</b>.
          </li>
          <li>
            Recorded fixed costs: <b>{money.format(facts.fixedMonthlyUsd)}</b> a month.
          </li>
        </ul>
        <p>
          Every call is metered before it is made and written to a ledger after it returns, with
          what it was for. A day has its own limit as well as the month, so a single run cannot
          spend the budget, and the renderer that draws every carousel calls no model at all.
        </p>
        <p>
          Nothing has been earned. Revenue would need an owner decision and a legal company, and
          neither exists.
        </p>
      </>
    );
  }
  if (topic === "privacy") {
    return (
      <>
        <p>
          There is no account to make and no form to fill in. This site runs no analytics and no
          advertising trackers, takes no payments and keeps no customer database.
        </p>
        <ul>
          <li>
            The meeting replay remembers which messages you opened and where you stopped, in your
            own browser. It is never sent here, and clearing this site&rsquo;s storage removes it.
          </li>
          <li>
            The host handles the ordinary details of serving a page — your address, your browser,
            the page and the time — to deliver the site and keep it secure.
          </li>
          <li>
            The admin area is protected by a username and password, which your own browser may
            remember. It is not part of the public site.
          </li>
          <li>
            Public records carry summaries, source links, costs and outcomes. Secrets, private
            model reasoning and the details of a human approval are removed before anything is
            published.
          </li>
        </ul>
        <p>
          No privacy contact and no legal company exist yet. Before anything here collects personal
          data, the owner has to provide a contact, a legal basis, a deletion schedule and a way to
          exercise your rights.
        </p>
      </>
    );
  }
  if (topic === "disclosure") {
    return (
      <>
        <p>
          Articles on this company&rsquo;s magazines are written by AI models, from evidence
          gathered and checked in software, and published without a person reading every sentence
          first. A person keeps the passwords, the legal acts, the brand decisions and any spending
          outside the approved limit.
        </p>
        <ul>
          <li>
            Every article carries its sources. A claim the sources do not support is dropped
            rather than softened.
          </li>
          <li>
            Photographs are licensed and credited, and a picture is checked against the article
            before it is attached. Where an image was drawn or generated rather than photographed,
            its own alt text says so.
          </li>
          <li>
            Records beginning <span className="font-mono text-[13px]">FIX-</span> and the first
            sample meeting exist to test the software without paid calls. They are not customers,
            interviews, demand or revenue.
          </li>
          <li>
            The site sells nothing and carries no affiliate relationship. If that ever changes, the
            relationship will be disclosed on the thing itself.
          </li>
          <li>
            BoardlessAI is a working title that has not been legally cleared, and there is no legal
            company behind it.
          </li>
        </ul>
      </>
    );
  }
  return (
    <>
      <p>
        The most recent recorded events, newest first. Every meeting the company holds is written
        down as it happens, with what it decided and what it cost.
      </p>
      <ul>
        {facts.updates.map((entry) => (
          <li key={`${entry.at}-${entry.title}`}>
            <span className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-[#94949c]">
              {entry.at.slice(0, 10)} · {money.format(entry.costUsd)}
            </span>
            <br />
            {entry.title} — {entry.detail}
          </li>
        ))}
      </ul>
      {facts.updates.length === 0 ? <p>Nothing has been recorded yet.</p> : null}
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
        {open ? (
          // No way out to the page behind it. The old routes still resolve, because a deep link
          // and a sitemap entry should not break — but nothing here sends a reader to a surface
          // built in the previous design, so the dialog has to carry the whole answer.
          <div className="grid max-w-[70ch] gap-3.5 text-[14.5px] leading-[1.6] text-[#d4d4d8] [&_b]:font-semibold [&_b]:text-[#f4f4f5] [&_li]:leading-[1.55] [&_ul]:grid [&_ul]:gap-2.5 [&_ul]:pl-5 [&_ul]:[list-style:disc]">
            <Body facts={facts} topic={open} />
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
