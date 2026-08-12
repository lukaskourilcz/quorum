import type { NextConfig } from "next";
import path from "node:path";

/**
 * The hook libraries, declared rather than inferred.
 *
 * `readLibrary` takes its root as a parameter so the tests can point it at a fixture, which means
 * no bundler can prove which directory it reads. Turbopack's answer was to trace the whole
 * repository into every function that could reach it; the call is marked `turbopackIgnore` in the
 * studio and the files it actually needs are named here instead. Every route below reads a hook
 * library at request time — the venture pages and the sitemap read one at build time, on a machine
 * that has the whole repository, so they need nothing traced.
 */
const hookLibraryFiles = ["../studio/hooks/**/*"];

/**
 * The typefaces, traced into every function that rasterises.
 *
 * They are read from `studio/fonts` at render time through a path derived from the module's own
 * URL, which no bundler can follow. Untraced, the deployed rasteriser would find no fonts at all
 * — and with system fonts deliberately switched off it would draw no text, silently, which is the
 * failure mode committing the files was meant to end.
 */
const fontFiles = ["../studio/fonts/**/*.ttf"];

const adminRuntimeFiles = ["../config/**/*", "../state/**/*", ...hookLibraryFiles, ...fontFiles];

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Production uses Next's default Turbopack build. Declaring it explicitly keeps that build
  // compatible with the development-only Webpack watcher hook used by the state-writing e2e run.
  turbopack: {},
  outputFileTracingIncludes: {
    "/admin": adminRuntimeFiles,
    "/admin/**": adminRuntimeFiles,
    "/api/carousel-studio/preview/[templateId]/[version]/[brand]/[format]/[slide]": [...hookLibraryFiles, ...fontFiles],
    "/money": ["../state/money/public.json"],
    "/results": ["../state/notify/digest/**/*", "../state/reports/**/*"],
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
  webpack(config, { dev }) {
    if (dev) {
      const ignored = config.watchOptions?.ignored;
      const stateRoot = path.join(__dirname, "..", "state");
      const statePattern = `^${stateRoot.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:[/\\\\]|$)`;
      config.watchOptions = {
        ...config.watchOptions,
        // Admin e2e journeys deliberately persist under the repository state root. The server
        // reads those files per request; rebuilding the app for each persisted receipt resets the
        // very client interaction the journey is verifying.
        ignored: ignored instanceof RegExp
          ? new RegExp(`(?:${ignored.source})|(?:${statePattern})`, ignored.flags)
          : [...(Array.isArray(ignored) ? ignored : ignored ? [ignored] : []), path.join(stateRoot, "**", "*")]
      };
    }
    return config;
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
      // The page is called Reports now and the nav is capped at six entries, so the name a
      // visitor would guess resolves rather than 404s.
      { source: "/reports", destination: "/results", permanent: true },
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
  // resvg is the second native module and needs the same treatment for the same reason: its
  // binding is loaded through a platform-suffixed specifier no bundler can resolve statically,
  // and a bundled copy would ship a rasteriser that cannot start. It is what turns a deck's SVG
  // into PNG bytes, so without this every admin deck slide answers 500 in production and nothing
  // on a development machine ever reproduces it.
  serverExternalPackages: ["sharp", "@resvg/resvg-js"]
};

export default nextConfig;
