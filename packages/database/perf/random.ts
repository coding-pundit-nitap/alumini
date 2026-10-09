/**
 * Mulberry32: a small, fast PRNG with a 32-bit state. Same seed, same sequence,
 * on every platform.
 */
export type Random = {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** `weights` need not sum to 1. */
  weighted<T>(items: readonly (readonly [T, number])[]): T;
  /** Up to `n` distinct items, in random order. */
  sample<T>(items: readonly T[], n: number): T[];
  uuid(): string;
  /** Alphanumeric token, for session tokens. */
  token(length: number): string;
};

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));
  const hex = (n: number) =>
    Array.from({ length: n }, () => int(0, 15).toString(16)).join("");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)]!,
    weighted(items) {
      const total = items.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [item, weight] of items) {
        roll -= weight;
        if (roll < 0) return item;
      }
      return items.at(-1)![0];
    },
    sample(items, n) {
      const copy = [...items];
      const count = Math.min(n, copy.length);
      for (let i = 0; i < count; i += 1) {
        const j = i + Math.floor(next() * (copy.length - i));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy.slice(0, count);
    },
    // RFC 4122 version 4 layout, so the ids look like the ones gen_random_uuid() makes.
    uuid: () =>
      `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[int(0, 3)]}${hex(3)}-${hex(12)}`,
    token: (length) =>
      Array.from({ length }, () => alphabet[int(0, alphabet.length - 1)]).join(
        ""
      ),
  };
}
