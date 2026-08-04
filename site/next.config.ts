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
  poweredByHeader: false,
  reactStrictMode: true
};

export default nextConfig;
