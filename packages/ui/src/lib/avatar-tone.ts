// Literal class strings so Tailwind's scanner picks them up.
const TONES = [
  "bg-chart-1/20 text-chart-1",
  "bg-chart-2/20 text-chart-2",
  "bg-chart-3/20 text-chart-3",
  "bg-chart-4/20 text-chart-4",
  "bg-chart-5/20 text-chart-5",
] as const;

/** A stable tint for an initials avatar, picked from the chart palette by hashing `seed` (usually a user id). */
export function avatarTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return TONES[Math.abs(hash) % TONES.length]!;
}
