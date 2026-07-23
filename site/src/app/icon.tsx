import { ImageResponse } from "next/og";
import { serverTokens } from "@/brand/tokens";

export const size = {
  width: 32,
  height: 32
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: serverTokens.obsidian,
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%"
      }}
    >
      <div
        style={{
          background: serverTokens.ember,
          borderRadius: 999,
          height: 9,
          width: 9
        }}
      />
    </div>,
    size
  );
}
