"use client";

import { formatDateTime } from "@/lib/utils";

export function LocalEventTime({ value }: { value: string }) {
  return <time dateTime={value}>{formatDateTime(value)}</time>;
}
