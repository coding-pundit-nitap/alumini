import Link from "next/link";

import { Button, buttonVariants } from "@nitap/ui/components/button";
import { Field, FieldLabel } from "@nitap/ui/components/field";

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
  "border-input bg-background h-9 rounded-full border px-3 text-sm";

/** A plain GET form: works without JavaScript and gives a shareable URL. */
export function ReportFilters({ values }: { values: Record<string, string> }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <Field className="w-auto">
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
      <Field className="w-auto">
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
      <Field orientation="horizontal" className="w-auto">
        <Button type="submit" className="rounded-full">
          Filter
        </Button>
        <Link
          href="/admin/reports"
          className={buttonVariants({
            variant: "ghost",
            className: "rounded-full",
          })}
        >
          Clear
        </Link>
      </Field>
    </form>
  );
}
