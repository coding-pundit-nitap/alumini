import type { CSSProperties } from "react";

/** Far → near. Low-poly peaks echo the DawnMark; the nearest ridge takes the page colour so the hero melts into the page. */
const RIDGES = [
  {
    d: "M0 220L80 190 150 205 240 150 310 175 390 120 460 160 540 135 615 112 690 176 745 158 830 102 900 150 980 128 1060 165 1140 118 1220 150 1300 132 1380 165 1440 150V400H0Z",
    fill: "oklch(0.3 0.05 310)",
    drift: "14%",
  },
  {
    d: "M0 262L90 232 170 250 260 200 340 240 420 212 520 250 600 222 720 272 840 218 930 240 1010 250 1110 205 1200 245 1290 216 1380 240 1440 226V400H0Z",
    fill: "oklch(0.225 0.04 290)",
    drift: "9%",
  },
  {
    d: "M0 305L110 272 200 296 300 256 400 292 480 266 580 302 680 270 780 306 880 266 980 296 1080 262 1180 302 1280 276 1440 298V400H0Z",
    fill: "oklch(0.18 0.025 272)",
    drift: "4%",
  },
  {
    d: "M0 352L140 322 260 346 380 316 520 352 660 330 800 356 940 326 1080 352 1220 322 1340 346 1440 332V400H0Z",
    fill: "var(--page-bg)",
    drift: "0%",
  },
];

const STARS = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37.3) % 100}%`,
  top: `${(i * 23.7) % 55}%`,
  size: i % 5 === 0 ? 2 : 1,
  opacity: 0.25 + ((i * 13) % 50) / 100,
}));

/** Decorative dawn over the ridges: sky, stars, a rising sun and four parallax ridgelines. */
export function DawnScene() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
    >
      <div className="landing-sky absolute inset-0" />
      {STARS.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
          }}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 h-[clamp(11rem,22vw,26rem)]">
        <div
          className="ridge-parallax absolute bottom-[34%] left-1/2 -ml-[clamp(3.5rem,7vw,6.5rem)]"
          style={{ "--drift": "-18%" } as CSSProperties}
        >
          <div className="landing-sun animate-sunrise size-[clamp(7rem,14vw,13rem)] rounded-full" />
        </div>
        {RIDGES.map((r) => (
          <svg
            key={r.drift}
            viewBox="0 0 1440 400"
            preserveAspectRatio="none"
            className="ridge-parallax absolute inset-0 size-full"
            style={{ "--drift": r.drift } as CSSProperties}
          >
            <path d={r.d} style={{ fill: r.fill }} />
          </svg>
        ))}
      </div>
    </div>
  );
}
