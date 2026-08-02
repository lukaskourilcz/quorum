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
    "/money": ["../state/money/public.json"]
  },
  poweredByHeader: false,
  reactStrictMode: true
};

export default nextConfig;
