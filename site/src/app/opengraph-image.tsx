import { ImageResponse } from "next/og";
import { serverTokens } from "@/brand/tokens";
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
        background: serverTokens.paper,
        color: serverTokens.obsidian,
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
            background: serverTokens.obsidian,
            borderRadius: 12,
            display: "flex",
            height: 48,
            width: 48
          }}
        />
        <div style={{ fontSize: 26, fontWeight: 700 }}>BoardlessAI</div>
        <div
          style={{
            background: serverTokens.ember,
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
          borderTop: `2px solid ${serverTokens.mist}`,
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
