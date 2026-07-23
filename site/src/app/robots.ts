import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api", "/ventures/release-evidence-notebook", "/ventures/plain-language-policy-diff", "/ventures/small-team-incident-brief"]
      }
    ],
    sitemap: `${base}/sitemap.xml`
  };
}
