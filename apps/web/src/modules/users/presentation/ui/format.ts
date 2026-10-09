const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2020-01-15" → "Jan 2020"; anything unparseable comes back as given. */
export function monthYear(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  const label = MONTHS[Number(month) - 1];
  return label ? `${label} ${year}` : isoDate;
}

/**
 * Whole months from one ISO date to another (or to `now`), counting both end
 * months, LinkedIn-style.
 */
export function duration(
  startIso: string,
  endIso: string | null,
  now = new Date()
): string {
  const [sy, sm] = startIso.split("-").map(Number);
  const [ey, em] = endIso
    ? endIso.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  if (!sy || !sm || !ey || !em) return "";
  const total = (ey - sy) * 12 + (em - sm) + 1;
  if (total <= 0) return "";
  const years = Math.floor(total / 12);
  const months = total % 12;
  const part = (n: number, one: string, many: string) =>
    n === 0 ? "" : `${n} ${n === 1 ? one : many}`;
  return [part(years, "yr", "yrs"), part(months, "mo", "mos")]
    .filter(Boolean)
    .join(" ");
}

/**
 * "https://www.github.com/asha/" → "github.com/asha", for showing a link
 * compactly.
 */
export function hostPath(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

export const LINK_LABEL: Record<string, string> = {
  LINKEDIN: "LinkedIn",
  GITHUB: "GitHub",
  TWITTER: "X (Twitter)",
  WEBSITE: "Website",
  OTHER: "Link",
};

/** Up to two initials for a company or institution tile. */
export const monogram = (name: string) =>
  name
    .split(/[\s,.&-]+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
