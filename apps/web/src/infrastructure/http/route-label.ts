// UUIDs (every domain table), Better Auth ids (≥ 20 alphanumerics) and plain numbers.
const ID_SEGMENT =
  /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9]{20,})$/i;

/** Low-cardinality `route` label: ids fold to `:id`, and unmatched 400/404/405 paths become `unmatched`. */
export function routeLabel(pathname: string, status: number): string {
  if (status === 400 || status === 404 || status === 405) return "unmatched";
  return pathname
    .split("/")
    .map((segment) => (ID_SEGMENT.test(segment) ? ":id" : segment))
    .join("/");
}
