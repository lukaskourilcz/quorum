import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/public-site-url";

export default function robots(): MetadataRoute.Robots {
  const base = getPublicSiteUrl();
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
