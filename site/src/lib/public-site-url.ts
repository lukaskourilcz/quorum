const PRODUCTION_SITE_URL = "https://quorum-site-chi.vercel.app";

export function getPublicSiteUrl(): string {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL;
  return process.env.NODE_ENV === "production"
    ? PRODUCTION_SITE_URL
    : "http://localhost:3000";
}
