import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatUsd(value: number | null): string {
  return value === null
    ? "n/a"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
      }).format(value);
}

export const DISPLAY_TIME_ZONE = "Europe/Prague";
export const DISPLAY_TIME_ZONE_LABEL = "Prague time";

function displayDate(value: string | number | Date): Date {
  if (value instanceof Date || typeof value === "number") return new Date(value);
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value);
}

export function formatDate(value: string | number | Date): string {
  const parsed = displayDate(value);
  if (Number.isNaN(parsed.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric"
  }).format(parsed);
}

export function formatClock(
  value: string | number | Date,
  includeSeconds = false
): string {
  const parsed = displayDate(value);
  if (Number.isNaN(parsed.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    timeZone: DISPLAY_TIME_ZONE
  }).format(parsed);
}

export function formatDateTime(
  value: string | number | Date,
  includeSeconds = false
): string {
  const date = formatDate(value);
  const time = formatClock(value, includeSeconds);
  if (date === "Date unavailable" || time === "Time unavailable") {
    return "Date and time unavailable";
  }
  return `${date} · ${time} ${DISPLAY_TIME_ZONE_LABEL}`;
}
