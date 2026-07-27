import { cn } from "@/lib/utils";

const heights = ["34%", "52%", "41%", "66%", "48%", "100%", "38%", "57%", "44%", "29%"];

export function SignalBars({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("signal-bars", className)}>
      {heights.map((height, index) => (
        <span key={`${height}-${index}`} style={{ height }} />
      ))}
    </div>
  );
}
