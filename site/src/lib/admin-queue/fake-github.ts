import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Test support: the parts of GitHub's REST API a deployed Queue talks to, served from a throwaway
 * repository root, so a test drives the production path end to end without a network.
 *
 * The Contents API reads and writes files under the root and refuses a replace whose sha is not
 * the file's current one, as GitHub does. The Git Data API makes one commit of several files and
 * moves the branch only as a fast-forward: a ref update whose parent is no longer the head answers
 * 422, as GitHub does. The workflow dispatch answers whatever the test sets. Every request is
 * recorded in order, so a test can say what was dispatched and after which write. `afterRead` lets
 * a test land another writer's change between a read and the write that follows it.
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
  /** Called after each Contents API read is answered, with the file's repository path. */
  afterRead: ((relative: string) => Promise<void>) | null;
}

const DISPATCH_PATH = "/repos/lukaskourilcz/quorum/actions/workflows/social-publisher.yml/dispatches";
const CONTENTS = /^\/repos\/lukaskourilcz\/quorum\/contents\/(.+)$/u;
const GIT = "/repos/lukaskourilcz/quorum/git";

function version(bytes: Buffer): string {
  return createHash("sha1").update(bytes).digest("hex");
}

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

export function fakeGitHub(root: string): FakeGitHub {
  // The branch head moves on every write, whichever API made it.
  let writes = 0;
  const head = () => createHash("sha1").update(`head-${writes}`).digest("hex");
  const trees = new Map<string, Array<{ path: string; content: string }>>();
  const commits = new Map<string, { tree: string; parent: string }>();
  const fake: FakeGitHub = {
    afterRead: null,
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

      if (url.pathname === `${GIT}/ref/heads/main` && method === "GET") return json({ ref: "refs/heads/main", object: { sha: head() } }, 200);
      const commit = new RegExp(`^${GIT}/commits/([a-f0-9]{40})$`, "u").exec(url.pathname);
      // Commits are immutable on GitHub: an older head still answers after the branch moved on.
      if (commit && method === "GET") {
        const known = Array.from({ length: writes + 1 }, (_, index) => createHash("sha1").update(`head-${index}`).digest("hex")).includes(commit[1]!);
        return known ? json({ sha: commit[1], tree: { sha: `tree-${commit[1]}` } }, 200) : json({ message: "Not Found" }, 404);
      }
      if (url.pathname === `${GIT}/trees` && method === "POST" && body) {
        const id = createHash("sha1").update(JSON.stringify(body)).digest("hex");
        trees.set(id, (body.tree as Array<{ path: string; content: string }>).map(({ path: entry, content }) => ({ path: entry, content })));
        return json({ sha: id }, 201);
      }
      if (url.pathname === `${GIT}/commits` && method === "POST" && body) {
        const id = createHash("sha1").update(JSON.stringify(body)).digest("hex");
        commits.set(id, { tree: String(body.tree), parent: String((body.parents as string[])[0]) });
        return json({ sha: id }, 201);
      }
      if (url.pathname === `${GIT}/refs/heads/main` && method === "PATCH" && body) {
        const made = commits.get(String(body.sha));
        if (!made) return json({ message: "Object does not exist" }, 422);
        if (made.parent !== head() || body.force !== false) return json({ message: "Update is not a fast forward" }, 422);
        for (const entry of trees.get(made.tree) ?? []) {
          await mkdir(path.dirname(path.join(root, entry.path)), { recursive: true });
          await writeFile(path.join(root, entry.path), entry.content);
        }
        writes += 1;
        return json({ ref: "refs/heads/main", object: { sha: head() } }, 200);
      }

      const contents = CONTENTS.exec(url.pathname);
      if (!contents) return json({ message: "Not Found" }, 404);
      const relative = contents[1]!.split("/").map(decodeURIComponent).join("/");
      const file = path.join(root, relative);
      const current = await readFile(file).catch(() => null);
      if (method === "GET") {
        const answer = current
          ? json({ content: current.toString("base64"), encoding: "base64", sha: version(current) }, 200)
          : json({ message: "Not Found" }, 404);
        await fake.afterRead?.(relative);
        return answer;
      }
      if (method === "PUT" && body) {
        if (typeof body.sha === "string" ? !current || version(current) !== body.sha : current !== null) {
          return json({ message: current ? "sha does not match" : "sha wasn't supplied" }, current ? 409 : 422);
        }
        const bytes = Buffer.from(String(body.content), "base64");
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, bytes);
        writes += 1;
        return json({ content: { sha: version(bytes) } }, current ? 200 : 201);
      }
      return json({ message: "Method Not Allowed" }, 405);
    }
  };
  return fake;
}
