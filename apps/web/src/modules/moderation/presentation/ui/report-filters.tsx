import Link from "next/link";

import { Button, buttonVariants } from "@nitap/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@nitap/ui/components/field";

import { REPORT_TARGET_TYPES } from "../../domain/moderation";
import { TARGET_LABELS } from "./labels";

/** Human labels for every query field, so a validation error can name what to fix. */
export const REPORT_FILTER_LABELS: Record<string, string> = {
  status: "Status",
  targetType: "Type",
  limit: "Page size",
  cursor: "Page",
};

const SELECT_CLASS =
  "border-input bg-background h-9 rounded-lg border px-2.5 text-sm";

/** A plain GET form: works without JavaScript and produces a shareable URL (mirrors admin/audit-filters.tsx). */
export function ReportFilters({ values }: { values: Record<string, string> }) {
  return (
    <form method="get">
      <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="status">Status</FieldLabel>
          <select
            id="status"
            name="status"
            defaultValue={values.status ?? "open"}
            className={SELECT_CLASS}
          >
            <option value="open">Open and under review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="targetType">Type</FieldLabel>
          <select
            id="targetType"
            name="targetType"
            defaultValue={values.targetType ?? ""}
            className={SELECT_CLASS}
          >
            <option value="">Any type</option>
            {REPORT_TARGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {TARGET_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field orientation="horizontal">
          <Button type="submit">Filter</Button>
          <Link
            href="/admin/reports"
            className={buttonVariants({ variant: "ghost" })}
          >
            Clear
          </Link>
        </Field>
      </FieldGroup>
    </form>
  );
}
