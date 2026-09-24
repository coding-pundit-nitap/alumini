import { ImageResponse } from "next/og";

import { siteConfig } from "@/config/site";

export const alt = siteConfig.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Hex, not oklch: Satori can't parse oklch. Values approximate the dark Dawn tokens.
const INK = "#12141f";
const PAPER = "#f6f3ee";
const EMBER = "#e8743b";

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        backgroundColor: INK,
        backgroundImage: `radial-gradient(circle at 0% 0%, ${EMBER}55, transparent 55%)`,
        color: PAPER,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="64" height="64" viewBox="0 0 32 32">
          <circle cx="16" cy="19" r="7" fill={EMBER} />
          <polygon points="2,28 12,12 18,20 22,15 30,28" fill={PAPER} />
        </svg>
        <div style={{ fontSize: 32, opacity: 0.7 }}>{siteConfig.name}</div>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          fontSize: 68,
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: -1.5,
        }}
      >
        Stay connected with your NIT Arunachal Pradesh&nbsp;
        <span style={{ color: EMBER }}>community</span>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 26,
          opacity: 0.6,
          borderTop: `1px solid ${PAPER}33`,
          paddingTop: 24,
        }}
      >
        Verified alumni · Mentorship · Jobs · Events
      </div>
    </div>,
    { ...size }
  );
}
