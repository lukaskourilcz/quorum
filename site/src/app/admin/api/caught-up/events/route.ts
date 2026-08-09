import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import {
  applyEvent,
  EventsPersistenceError,
  parseEvent,
  readEventsFile,
  saveEventsFile,
} from "@/lib/caught-up-events-store";

export const dynamic = "force-dynamic";

const json = (value: unknown, status: number) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin event writes are not allowed." }, 403);
  }
  if (Number(request.headers.get("content-length") ?? "0") > 8_192) {
    return json({ error: "Event payload exceeds 8192 bytes." }, 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Event payload must be valid JSON." }, 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return json({ error: "Event payload must be an object." }, 400);
  }

  const body = payload as Record<string, unknown>;
  const event = parseEvent(body.event);
  if (!event) {
    return json(
      { error: "Check the id, scope, Czech title, start date and https link." },
      422,
    );
  }

  // The publishing day comes from the caller so a save is reproducible and
  // testable; it is validated rather than trusted.
  const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(body.today)
    ? body.today
    : new Date().toISOString().slice(0, 10);

  try {
    const current = await readEventsFile(today);
    const { file, action } = applyEvent(current, event, {
      today,
      correction: body.correction === true,
      archive: body.archive === true,
    });
    const receipt = {
      schemaVersion: "event-save/1",
      date: today,
      id: event.id,
      action,
      correction: body.correction === true,
      before: current.events.length,
      after: file.events.length,
    };
    const persistence = await saveEventsFile(file, receipt, event.id);
    return json({ id: event.id, action, persistence, count: file.events.length }, 201);
  } catch (error) {
    if (error instanceof EventsPersistenceError) {
      // An immutable past event is the caller's mistake, not an outage.
      const immutable = error.message.includes("past event");
      return json({ error: error.message }, immutable ? 409 : 503);
    }
    return json({ error: "The event was not saved." }, 503);
  }
}
