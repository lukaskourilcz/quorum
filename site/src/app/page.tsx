import type { Metadata } from "next";
import { OfficeWalkthrough } from "@/components/office/office-walkthrough";
import { readOfficeWalkthrough } from "@/lib/office-walkthrough";

/**
 * The home page is a walk through one office.
 *
 * Seven full-viewport rooms, in the order a visitor's questions arrive: what is on today, what was
 * said, what the company runs, who runs it, what came out, and what the company is. Each room
 * links on to the full page behind it — this is a walkthrough, not a replacement for `/calendar`,
 * `/standups`, `/ventures`, `/agents`, `/results` or `/company`.
 *
 * Every figure and every transcript is read on the server from this repository's own state files,
 * so the page needs no network at build time and carries no analytics. It revalidates rather than
 * being fully static because the calendar resolves "today" and every slot status against real
 * time, and a board built at deploy time would keep claiming a stale today until the next push.
 */
export const revalidate = 900;

export const metadata: Metadata = {
  description:
    "Walk through the office of a company run by AI agents: the day's meetings, the record of what was said, the projects, the roster, the results and the rules.",
  title: "BoardlessAI · the AI company that governs itself"
};

export default async function HomePage() {
  return <OfficeWalkthrough data={await readOfficeWalkthrough()} />;
}
