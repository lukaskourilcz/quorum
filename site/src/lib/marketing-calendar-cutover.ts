export function marketingCalendarDestination(venture: "caught-up" | "marketingshark", env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.OWN_DASHBOARD_MARKETING_CUTOVER_VERIFIED !== "true" || !env.OWN_DASHBOARD_MARKETING_CALENDAR_URL) return null;
  try {
    const url = new URL(env.OWN_DASHBOARD_MARKETING_CALENDAR_URL);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.searchParams.set("brand", venture === "caught-up" ? "dneskai" : "devshark");
    return url.href;
  } catch { return null; }
}
