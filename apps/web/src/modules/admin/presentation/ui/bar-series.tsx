import type { WeekPoint } from "../../domain/analytics";

const weekLabel = (week: string) =>
  new Date(`${week}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/**
 * Weekly volume as CSS columns (spec F-7, no chart library). The total is printed, each column carries its
 * value in a tooltip, and a screen-reader table holds every point, so nothing depends on colour or shape.
 */
export function BarSeries({
  label,
  points,
}: {
  label: string;
  points: readonly WeekPoint[];
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const first = points[0];
  const last = points.at(-1);
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{total}</span>
      </figcaption>
      <div aria-hidden className="flex h-24 items-end gap-px">
        {points.map((p) => (
          <div
            key={p.week}
            title={`Week of ${weekLabel(p.week)}: ${p.value}`}
            className="bg-chart-1 min-h-px flex-1 rounded-t-sm"
            style={{
              height: `${(p.value / max) * 100}%`,
              opacity: p.value === 0 ? 0.25 : 1,
            }}
          />
        ))}
      </div>
      {first && last && (
        <div
          aria-hidden
          className="text-muted-foreground flex justify-between text-xs"
        >
          <span>{weekLabel(first.week)}</span>
          <span>{weekLabel(last.week)}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>{label}, per week</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.week}>
              <td>{weekLabel(p.week)}</td>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
