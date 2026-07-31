const args = process.argv.slice(2);
const baseIndex = args.indexOf("--base");
const base = new URL(
  baseIndex >= 0 && args[baseIndex + 1]
    ? args[baseIndex + 1]
    : "http://127.0.0.1:3000"
);

if (!["127.0.0.1", "localhost", "::1"].includes(base.hostname)) {
  throw new Error("Smoke crawler is local-only unless the script is explicitly extended");
}

const agentSlugs = [
  "vize",
  "forge",
  "pulse",
  "audit",
  "scout",
  "scribe",
  "lens",
  "quill",
  "radar",
  "keeper",
  "threads",
  "instagram",
  "people",
  "ledger",
  "herald",
  "stet",
  "hacek",
  "spark",
  "vault",
  "frame",
  "relay"
];
const ventureSlugs = [
  "release-evidence-notebook",
  "plain-language-policy-diff",
  "small-team-incident-brief"
];
const expectedRoutes = [
  "/",
  "/about",
  "/agents",
  ...agentSlugs.map((slug) => `/agents/${slug}`),
  "/boardroom",
  "/company",
  "/disclosure",
  "/feed.json",
  "/feed.xml",
  "/governance",
  "/incubator",
  "/icon",
  "/log",
  "/manifest.webmanifest",
  "/metrics",
  "/privacy",
  "/robots.txt",
  "/sitemap.xml",
  "/standups",
  "/standups/2026-07-23-founding",
  "/standups/2026-07-23-founding/room",
  "/ventures",
  "/ventures/caught-up",
  "/ventures/titty-tuesdays",
  ...ventureSlugs.map((slug) => `/ventures/${slug}`)
];

async function request(pathname) {
  const response = await fetch(new URL(pathname, base), {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000)
  });
  return {
    pathname,
    response,
    body: await response.text()
  };
}

const results = await Promise.all(expectedRoutes.map(request));
const failures = [];

for (const result of results) {
  if (result.response.status !== 200) {
    failures.push(`${result.pathname}: expected 200, received ${result.response.status}`);
  }
  if (
    result.response.headers.get("content-type")?.includes("text/html") &&
    !result.body.includes("<main")
  ) {
    failures.push(`${result.pathname}: HTML has no main landmark`);
  }
  if (/lorem ipsum|placeholder copy|coming soon/i.test(result.body)) {
    failures.push(`${result.pathname}: placeholder content detected`);
  }
}

const homepage = results.find((result) => result.pathname === "/");
if (!homepage) {
  failures.push("/: missing result");
} else {
  const csp = homepage.response.headers.get("content-security-policy") ?? "";
  if (!csp.includes("default-src 'self'")) {
    failures.push("/: missing restrictive Content-Security-Policy");
  }
  if (homepage.response.headers.get("x-content-type-options") !== "nosniff") {
    failures.push("/: missing X-Content-Type-Options");
  }
  if (!homepage.body.includes("autonomous software roles, not human employees")) {
    failures.push("/: missing required agent disclosure");
  }
}

const linkedPaths = new Set();
for (const { response, body } of results) {
  if (!response.headers.get("content-type")?.includes("text/html")) {
    continue;
  }
  for (const match of body.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) {
      continue;
    }
    const target = new URL(href.replaceAll("&amp;", "&"), base);
    if (target.origin === base.origin) {
      linkedPaths.add(target.pathname);
    }
  }
}

const linkedResults = await Promise.all([...linkedPaths].sort().map(request));
for (const result of linkedResults) {
  if (![200, 401, 503].includes(result.response.status)) {
    failures.push(
      `linked ${result.pathname}: expected 200/401/503, received ${result.response.status}`
    );
  }
}

const jsonFeed = results.find((result) => result.pathname === "/feed.json");
if (!jsonFeed) {
  failures.push("/feed.json: missing result");
} else {
  const feed = JSON.parse(jsonFeed.body);
  if (!Array.isArray(feed.items)) {
    failures.push("/feed.json: items must be an array");
  } else if (
    feed.items.some((item) =>
      String(item.url ?? "").includes("/standups/2026-07-23-founding")
    )
  ) {
    failures.push("/feed.json: fixture records must be excluded");
  }
}

const xmlFeed = results.find((result) => result.pathname === "/feed.xml");
if (xmlFeed?.body.includes("/standups/2026-07-23-founding")) {
  failures.push("/feed.xml: fixture records must be excluded");
}

const sitemap = results.find((result) => result.pathname === "/sitemap.xml");
if (
  sitemap?.body.includes("/standups/2026-07-23-founding") ||
  ventureSlugs.some((slug) => sitemap?.body.includes(`/ventures/${slug}`))
) {
  failures.push("/sitemap.xml: noindex fixture routes must be excluded");
}

const admin = await request("/admin");
if (![401, 503].includes(admin.response.status)) {
  failures.push(`/admin: fail-closed status expected, received ${admin.response.status}`);
}
if (!(admin.response.headers.get("x-robots-tag") ?? "").includes("noindex")) {
  failures.push("/admin: missing noindex response header");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        status: "passed",
        expectedRoutes: results.length,
        internalLinks: linkedResults.length,
        adminStatus: admin.response.status,
        publishedFeedItems: jsonFeed
          ? JSON.parse(jsonFeed.body).items?.length ?? 0
          : 0
      },
      null,
      2
    )
  );
}
