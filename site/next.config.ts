import type { NextConfig } from "next";
import path from "node:path";

const adminRuntimeFiles = ["../config/**/*", "../state/**/*"];

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  experimental: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"]
    }
  },
  outputFileTracingIncludes: {
    "/admin": adminRuntimeFiles,
    "/admin/**": adminRuntimeFiles,
    "/money": ["../state/money/public.json"],
    "/results": ["../state/notify/digest/**/*"],
    // The cron route reads the venture registry at request time to learn which Prague hour each
    // phase belongs to. Every other reader of that file is a page Next renders at build time, on
    // a machine that has the whole repository; this one is a function running months later with
    // only what was traced into its bundle, and without this line it would answer every firing
    // with "registry-unreadable" and dispatch nothing.
    //
    // The key must keep matching the route path Next derives from the directory name, and it is
    // matched as a glob, in which `[phase]` is a character class rather than a literal. That is
    // an easy thing to break by renaming the segment and never notice, so the cron route's test
    // asserts the match against Next's own matcher rather than trusting that it looks right.
    "/api/cron/[phase]": ["../config/ventures.json"]
  },
  /**
   * Where the eleven-item navigation went.
   *
   * Money and the measures are sections of /results; what the company is, the rules it works
   * under and what it discloses are sections of /company. /boardroom was a second copy of the
   * meeting archive built out of fixtures, and its readers belong on /standups. Every one of
   * these URLs has been public, so none of them is allowed to 404.
   *
   * /incubator is the same rule applied to a closed venture: the Magazine Incubator page had
   * been public and the venture is gone, so the URL lands on the venture index rather than
   * dying. The page it pointed at is not coming back — the owner's direction is that no new
   * magazine is ideated again.
   */
  async redirects() {
    return [
      { source: "/boardroom", destination: "/standups", permanent: true },
      { source: "/incubator", destination: "/ventures", permanent: true },
      { source: "/money", destination: "/results#money", permanent: true },
      { source: "/metrics", destination: "/results#measures", permanent: true },
      { source: "/about", destination: "/company#about", permanent: true },
      { source: "/governance", destination: "/company#rules", permanent: true },
      { source: "/disclosure", destination: "/company#disclosure", permanent: true }
    ];
  },
  poweredByHeader: false,
  reactStrictMode: true,
  // sharp loads its libvips binding through `require('@img/sharp-' + platform)`, a specifier no
  // bundler can resolve statically. Bundled, its JavaScript is inlined and the binding is never
  // traced, so the deployed function ships a sharp that cannot start — which is what happened:
  // every admin deck slide answered 500 while the SVG template previews next door were fine,
  // because only the deck path rasterises. Listing it here keeps it a real runtime dependency,
  // which is what makes the trace pick up the platform binaries. It is also declared in this
  // package's dependencies, because a function resolves `sharp` from `site/node_modules` and
  // pnpm only links it there for the package that asks for it.
  serverExternalPackages: ["sharp"]
};

export default nextConfig;
