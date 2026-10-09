/**
 * Wall time in a zone to a UTC instant with `Intl` only (no Temporal on Node 24). Ambiguous times
 * resolve to the earlier instant; times in a DST gap shift forward by the gap.
 */
const WALL_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The zone's offset (minutes, local = UTC + offset) at a given instant. */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) === 24 ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return (asUTC - instant.getTime()) / 60_000;
}

/**
 * Two-pass offset fix. If the passes disagree the time is in a DST gap, so shift forward using the
 * smaller offset.
 */
function fixOffset(
  localMillis: number,
  offset: number,
  timeZone: string
): number {
  let utcGuess = localMillis - offset * 60_000;
  const offset2 = offsetMinutesAt(new Date(utcGuess), timeZone);
  if (offset === offset2) return utcGuess;
  utcGuess -= (offset2 - offset) * 60_000;
  const offset3 = offsetMinutesAt(new Date(utcGuess), timeZone);
  if (offset2 === offset3) return utcGuess;
  return localMillis - Math.min(offset2, offset3) * 60_000;
}

export function zonedWallTimeToUtc(wall: string, timeZone: string): Date {
  const match = WALL_TIME_RE.exec(wall);
  if (!match) throw new RangeError(`Malformed wall time: ${wall}`);
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Invalid time zone: ${timeZone}`);
  }
  const [, y, mo, d, h, mi] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);

  const localMillis = Date.UTC(year, month - 1, day, hour, minute, 0);
  // Date.UTC silently rolls over an invalid calendar date (e.g. Feb 30); reject it instead.
  const probe = new Date(localMillis);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day ||
    probe.getUTCHours() !== hour ||
    probe.getUTCMinutes() !== minute
  ) {
    throw new RangeError(`Malformed wall time: ${wall}`);
  }

  const initialOffset = offsetMinutesAt(probe, timeZone);
  return new Date(fixOffset(localMillis, initialOffset, timeZone));
}
