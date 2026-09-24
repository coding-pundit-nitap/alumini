import { ImageResponse } from "next/og";

import { siteConfig } from "@/config/site";

export const alt = siteConfig.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 80,
        textAlign: "center",
        backgroundColor: "#0a0a0a",
        color: "#fafafa",
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>
        {siteConfig.name}
      </div>
      <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.2 }}>
        Stay connected with your NIT Arunachal Pradesh community
      </div>
    </div>,
    { ...size }
  );
}
