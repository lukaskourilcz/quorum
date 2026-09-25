import { readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "../../src/paths.js";

/**
 * Replays Buffer answers from `tests/fixtures/buffer/`. The fixtures are transcribed from Buffer's
 * published examples (each names its page); no live call recorded them, and none is ever made.
 */

export type BufferOperation = "BoardlessBufferChannel" | "BoardlessBufferCreatePost" | "BoardlessBufferPost";

export interface RecordedBufferCall {
  url: string;
  operation: string;
  variables: Record<string, unknown>;
  authorization: string | null;
}

interface Fixture {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export function bufferFixture(name: string): Fixture {
  const file = path.join(repoRoot, "orchestrator/tests/fixtures/buffer", `${name}.json`);
  const { status, headers, body } = JSON.parse(readFileSync(file, "utf8")) as Fixture;
  return { status, headers, body };
}

/** Each operation answers from its own script in order; an unscripted request fails the test. */
export function replayBuffer(script: Partial<Record<BufferOperation, Array<string | Error>>>): {
  fetchImpl: typeof fetch;
  calls: RecordedBufferCall[];
} {
  const remaining = new Map(Object.entries(script).map(([operation, answers]) => [operation, [...answers]]));
  const calls: RecordedBufferCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
    const operation = /(?:query|mutation)\s+(\w+)/u.exec(body.query)?.[1] ?? "unknown";
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), operation, variables: body.variables, authorization: headers.get("authorization") });
    const next = remaining.get(operation)?.shift();
    if (next === undefined) throw new Error(`Unscripted Buffer request: ${operation}`);
    if (next instanceof Error) throw next;
    const fixture = bufferFixture(next);
    return new Response(JSON.stringify(fixture.body), { status: fixture.status, headers: fixture.headers });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
