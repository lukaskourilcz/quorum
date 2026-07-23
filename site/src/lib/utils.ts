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

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}
