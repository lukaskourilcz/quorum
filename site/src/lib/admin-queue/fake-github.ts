import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Test support: the two parts of GitHub's REST API a deployed Queue talks to, served from a
 * throwaway repository root, so a test drives the production path end to end without a network.
 *
 * The Contents API reads and writes files under the root and refuses a replace whose sha is not
 * the file's current one, as GitHub does. The workflow dispatch answers whatever the test sets.
 * Every request is recorded in order, so a test can say what was dispatched and after which write.
 */
export interface FakeGitHubCall {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  authorization: string | null;
}

export interface FakeGitHub {
  fetch: typeof fetch;
  calls: FakeGitHubCall[];
  dispatches(): FakeGitHubCall[];
  /** The dispatch endpoint's next answer: a status, or a thrown network error. */
  dispatchAnswer: { status: number; body?: unknown } | "network-error";
}

const DISPATCH_PATH = "/repos/lukaskourilcz/quorum/actions/workflows/social-publisher.yml/dispatches";
const CONTENTS = /^\/repos\/lukaskourilcz\/quorum\/contents\/(.+)$/u;

function version(bytes: Buffer): string {
  return createHash("sha1").update(bytes).digest("hex");
}

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

export function fakeGitHub(root: string): FakeGitHub {
  const fake: FakeGitHub = {
    calls: [],
    dispatchAnswer: { status: 200, body: { workflow_run_id: 42, run_url: "https://api.github.com/repos/lukaskourilcz/quorum/actions/runs/42", html_url: "https://github.com/lukaskourilcz/quorum/actions/runs/42" } },
    dispatches: () => fake.calls.filter((call) => call.path === DISPATCH_PATH),
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
      const headers = new Headers(init?.headers);
      fake.calls.push({ method, path: url.pathname, body, authorization: headers.get("authorization") });
      if (url.hostname !== "api.github.com") return json({ message: "Not Found" }, 404);

      if (url.pathname === DISPATCH_PATH && method === "POST") {
        const answer = fake.dispatchAnswer;
        if (answer === "network-error") throw new TypeError("fetch failed");
        return answer.body === undefined ? new Response(null, { status: answer.status }) : json(answer.body, answer.status);
      }

      const contents = CONTENTS.exec(url.pathname);
      if (!contents) return json({ message: "Not Found" }, 404);
      const relative = contents[1]!.split("/").map(decodeURIComponent).join("/");
      const file = path.join(root, relative);
      const current = await readFile(file).catch(() => null);
      if (method === "GET") {
        if (!current) return json({ message: "Not Found" }, 404);
        return json({ content: current.toString("base64"), encoding: "base64", sha: version(current) }, 200);
      }
      if (method === "PUT" && body) {
        if (typeof body.sha === "string" ? !current || version(current) !== body.sha : current !== null) {
          return json({ message: current ? "sha does not match" : "sha wasn't supplied" }, current ? 409 : 422);
        }
        const bytes = Buffer.from(String(body.content), "base64");
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, bytes);
        return json({ content: { sha: version(bytes) } }, current ? 200 : 201);
      }
      return json({ message: "Method Not Allowed" }, 405);
    }
  };
  return fake;
}
