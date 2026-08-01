"use client";

import { useEffect, useState } from "react";

export function LocalEventTime({ value }: { value: string }) {
  const [label, setLabel] = useState("Shown in your time after the page loads");
  useEffect(() => setLabel(new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })), [value]);
  return <time dateTime={value} suppressHydrationWarning>{label}</time>;
}
