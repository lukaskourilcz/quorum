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
  /**
   * The React Compiler, on for the whole app.
   *
   * It is a top-level option in this version, not an `experimental` one, and it needs
   * `babel-plugin-react-compiler` as a devDependency — Next runs the compiler through Babel but
   * gates it behind an SWC pre-pass, so only files with JSX or hooks pay for it.
   *
   * It behaves. The wheel lock, the four panels, the room views and the whole day performance were
   * walked by hand with it on, because a test suite cannot see a stale closure that still renders
   * something plausible; nothing was stale and nothing desynchronised.
   *
   * What it costs is worth writing down, because it is the opposite of what the flag is usually
   * turned on for. Measured on this app, same build, same machine:
   *
   *              first-load JS   on-demand chunk   scripting over a whole day performance
   *   off            573.7 kB          17.2 kB      64 ms, no long tasks
   *   on             597.9 kB          24.2 kB      50 ms, no long tasks
   *
   * So it buys 14 ms of main-thread time across a thirty-second animation that was already
   * nowhere near dropping a frame, and charges 24 kB of first-load JS for it — more than the
   * code-splitting in this same issue saved. The plan's motion is CSS and React only re-renders
   * on the beat tick, which is why there was so little render pressure for it to remove.
   *
   * Kept on because the flag was a decided item and nothing broke, but the trade is a poor one on
   * this app and `docs/NEEDED.md` carries it as a call the owner can reverse in one line.
   */
  reactCompiler: true,
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
