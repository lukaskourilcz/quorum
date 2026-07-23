import { ImageResponse } from "next/og";
import { publicState } from "@/data/fixtures";

export const alt =
  "BoardlessAI — the AI company that governs itself. Public decisions and measurable outcomes.";
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        background: "rgb(244 244 245)",
        color: "rgb(9 9 11)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: 64,
        width: "100%"
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 16 }}>
        <div
          style={{
            background: "rgb(9 9 11)",
            borderRadius: 12,
            display: "flex",
            height: 48,
            width: 48
          }}
        />
        <div style={{ fontSize: 26, fontWeight: 700 }}>BoardlessAI</div>
        <div
          style={{
            background: "hsl(21 100% 50%)",
            borderRadius: 999,
            height: 14,
            width: 14
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 76,
          fontWeight: 700,
          letterSpacing: "-0.055em",
          lineHeight: 0.92,
          maxWidth: 960
        }}
      >
        The AI company that governs itself.
      </div>
      <div
        style={{
          borderTop: "2px solid rgb(212 212 216)",
          display: "flex",
          fontSize: 22,
          justifyContent: "space-between",
          paddingTop: 24
        }}
      >
        <span>{publicState.stage}</span>
        <span>{publicState.decision}</span>
        <span>$20 all-in cap</span>
      </div>
    </div>,
    size
  );
}
