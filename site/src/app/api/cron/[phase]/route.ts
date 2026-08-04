import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseScheduledPhase,
  pragueHour,
  resolveCronSlots,
  type ScheduledPhase
} from "@/lib/cron-slots";

/**
 * The punctual half of the council's schedule.
 *
 * GitHub's `schedule` trigger is documented as best effort and has behaved like it: 13 to 54
 * minutes late on 2 August, 2h23m to 2h55m on 4 August. `workflow_dispatch` starts within
 * seconds, so a Vercel cron on the slot's own hour calling the dispatch API is the punctual path.
 * `site/vercel.json` holds one entry per slot per daylight-saving variant, each pointing here
 * with the phase in the path.
 *
 * This route spends the owner's money — every successful dispatch can start a paid council run —
 * so refusing everything that is not Vercel's cron is the first thing it does and the reason
 * every other branch below is reachable only after it.
 */

// Never prerendered and never cached: this reads a per-request header and has an effect.
export const dynamic = "force-dynamic";
// Node, not edge: the slot table is read from config/ventures.json on disk, and the constant-time
// comparison uses node:crypto.
export const runtime = "nodejs";

const DISPATCH_OWNER = "lukaskourilcz";
const DISPATCH_REPOSITORY = "quorum";
const DISPATCH_WORKFLOW = "cycle.yml";
const DISPATCH_REF = "main";

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

/**
 * Whether the Authorization header is the one Vercel was told to send.
 *
 * Both sides are hashed before the comparison, so the buffers are always 32 bytes and
 * `timingSafeEqual` never throws on a length mismatch — which is itself the leak a naive
 * length check reintroduces, because throwing early tells the caller how long the secret is.
 * The digest is of the whole `Bearer <secret>` string, so a header with the right secret and a
 * wrong scheme does not pass either.
 *
 * Returns false when CRON_SECRET is unset or empty. Without that this route is a public URL that
 * starts paid council runs for anyone who finds it, so an absent secret has to refuse everything
 * rather than compare against nothing and let it through.
 */
function isVercelCron(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length === 0) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(header ?? ""), digest(`Bearer ${secret}`));
}

async function slotHourFor(phase: ScheduledPhase): Promise<number | null> {
  const registry = JSON.parse(
    await readFile(path.join(repositoryRoot(), "config", "ventures.json"), "utf8")
  ) as unknown;
  return resolveCronSlots(registry).find((slot) => slot.phase === phase)?.hour ?? null;
}

async function dispatch(phase: ScheduledPhase, token: string): Promise<Response> {
  const response = await fetch(
    `https://api.github.com/repos/${DISPATCH_OWNER}/${DISPATCH_REPOSITORY}/actions/workflows/${DISPATCH_WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28"
      },
      // `trigger` is what makes the workflow treat this as a scheduled firing rather than as the
      // owner at the keyboard: it runs live, it claims the slot, and it is subject to the
      // double-fire guard. Nothing else is sent — not `dry`, not `delivery_only` — so this route
      // cannot ask for anything a cron firing could not have asked for.
      body: JSON.stringify({ ref: DISPATCH_REF, inputs: { phase, trigger: "vercel-cron" } })
    }
  );
  if (response.status !== 204) {
    const detail = (await response.text()).slice(0, 300);
    return Response.json(
      { dispatched: false, phase, reason: "github-rejected", status: response.status, detail },
      { status: 502 }
    );
  }
  return Response.json({ dispatched: true, phase }, { status: 202 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ phase: string }> }
): Promise<Response> {
  if (!isVercelCron(request.headers.get("authorization"))) {
    // No detail, and the same answer for a missing secret as for a wrong one: which of the two
    // it was is information a caller probing this URL does not get to have.
    return new Response("Unauthorized", { status: 401 });
  }

  const phase = parseScheduledPhase((await context.params).phase);
  if (!phase) return Response.json({ dispatched: false, reason: "unknown-phase" }, { status: 404 });

  let slotHour: number | null;
  try {
    slotHour = await slotHourFor(phase);
  } catch {
    // A registry that cannot be read is not a reason to fire blind. Refusing costs one late
    // meeting, which the GitHub schedule still covers; guessing costs a paid run at the wrong
    // hour for the wrong room.
    return Response.json({ dispatched: false, phase, reason: "registry-unreadable" }, { status: 503 });
  }
  if (slotHour === null) {
    return Response.json({ dispatched: false, phase, reason: "phase-has-no-slot" }, { status: 404 });
  }

  // Each slot carries two entries, one per daylight-saving variant, and both fire every day
  // because a Vercel cron expression is UTC and knows nothing about Prague. Exactly one of them
  // lands inside the Prague hour the meeting belongs to; the other is an hour off and does
  // nothing. Reading the offset at the moment of the call rather than from the calendar is what
  // makes the two changeover days work without a special case.
  const now = new Date();
  const wallHour = pragueHour(now);
  if (wallHour !== slotHour) {
    return Response.json(
      { dispatched: false, phase, reason: "inactive-dst-variant", pragueHour: wallHour, slotHour },
      { status: 200 }
    );
  }

  const token = process.env.QUORUM_DISPATCH_TOKEN;
  if (!token) {
    return Response.json({ dispatched: false, phase, reason: "no-dispatch-token" }, { status: 503 });
  }
  return dispatch(phase, token);
}
