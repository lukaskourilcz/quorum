"use client";

export function LocalEventTime({ value }: { value: string }) {
  return <time dateTime={value} suppressHydrationWarning>{new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>;
}
