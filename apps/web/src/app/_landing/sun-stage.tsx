const SUN_Y = [58, 48, 26] as const;

/** A sun at three heights over the horizon: 0 a sliver, 1 half risen, 2 fully up with rays. */
export function SunStage({ stage }: { stage: 0 | 1 | 2 }) {
  const cy = SUN_Y[stage];
  return (
    <svg viewBox="0 0 120 56" aria-hidden="true" className="h-14 w-auto">
      <defs>
        <clipPath id={`sky-${stage}`}>
          <rect width="120" height="48" />
        </clipPath>
      </defs>
      {stage === 2
        ? [0, 30, 60, 90, 120, 150, 180].map((a) => {
            const r = (a * Math.PI) / 180;
            return (
              <line
                key={a}
                x1={60 + Math.cos(r) * 19}
                y1={cy - Math.sin(r) * 19}
                x2={60 + Math.cos(r) * 25}
                y2={cy - Math.sin(r) * 25}
                stroke="var(--brand)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            );
          })
        : null}
      <circle
        cx="60"
        cy={cy}
        r="14"
        fill="var(--brand)"
        clipPath={`url(#sky-${stage})`}
      />
      <line
        x1="0"
        y1="48.5"
        x2="120"
        y2="48.5"
        stroke="currentColor"
        strokeOpacity="0.35"
      />
    </svg>
  );
}
