import type { Count, MaskedBucket } from "../../domain/analytics";

const CHART_COLOURS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
];

/**
 * Small buckets are suppressed upstream; they render as "< 5", never as a
 * number.
 */
export const formatCount = (count: Count) =>
  typeof count === "number" ? count.toLocaleString("en-IN") : "< 5";

/**
 * A breakdown as labelled horizontal bars; the value is always printed beside
 * its bar.
 */
export function BarBreakdown({
  label,
  buckets,
  labelOf = (key) => key,
}: {
  label: string;
  buckets: readonly MaskedBucket[];
  labelOf?: (key: string) => string;
}) {
  const max = Math.max(
    1,
    ...buckets.map((b) => (typeof b.count === "number" ? b.count : 0))
  );
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-muted-foreground text-sm">{label}</figcaption>
      {buckets.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing yet.</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">{label}</caption>
          <tbody>
            {buckets.map((b, i) => (
              <tr key={b.key}>
                <th
                  scope="row"
                  className="w-1/3 py-1 pr-3 text-left font-normal"
                >
                  {labelOf(b.key)}
                </th>
                <td className="py-1">
                  <div
                    aria-hidden
                    className={`${CHART_COLOURS[i % CHART_COLOURS.length]} h-2.5 rounded-full`}
                    style={{
                      width: `${typeof b.count === "number" ? (b.count / max) * 100 : 0}%`,
                    }}
                  />
                </td>
                <td className="w-16 py-1 pl-3 text-right tabular-nums">
                  {formatCount(b.count)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
