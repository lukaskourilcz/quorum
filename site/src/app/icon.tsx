import { ImageResponse } from "next/og";

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
        background: "rgb(9 9 11)",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%"
      }}
    >
      <div
        style={{
          background: "hsl(21 100% 50%)",
          borderRadius: 999,
          height: 9,
          width: 9
        }}
      />
    </div>,
    size
  );
}
