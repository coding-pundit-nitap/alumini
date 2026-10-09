import { Button, buttonVariants } from "@nitap/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@nitap/ui/components/field";
import { Input } from "@nitap/ui/components/input";

/** Human labels for every query field, so a validation error can name what to fix. */
export const AUDIT_FILTER_LABELS: Record<string, string> = {
  action: "Action",
  actorId: "Actor id",
  targetType: "Target type",
  targetId: "Target id",
  from: "From",
  to: "To",
  limit: "Page size",
  cursor: "Page",
};

const TEXT_FIELDS = [
  { name: "action", label: "Action", placeholder: "job.approved" },
  { name: "actorId", label: "Actor id", placeholder: "uuid" },
  { name: "targetType", label: "Target type", placeholder: "job" },
  { name: "targetId", label: "Target id", placeholder: "uuid" },
] as const;

/**
 * A plain GET form: works without JavaScript and produces a shareable URL.
 * ponytail: datetime-local is parsed in the server's zone; send an explicit offset if admins span zones.
 */
export function AuditFilters({ values }: { values: Record<string, string> }) {
  return (
    <form method="get">
      <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TEXT_FIELDS.map((f) => (
          <Field key={f.name}>
            <FieldLabel htmlFor={f.name}>{f.label}</FieldLabel>
            <Input
              id={f.name}
              name={f.name}
              defaultValue={values[f.name] ?? ""}
              placeholder={f.placeholder}
              className="rounded-lg"
            />
          </Field>
        ))}
        <Field>
          <FieldLabel htmlFor="from">From</FieldLabel>
          <Input
            id="from"
            name="from"
            type="datetime-local"
            defaultValue={values.from ?? ""}
            className="rounded-lg"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="to">To (exclusive)</FieldLabel>
          <Input
            id="to"
            name="to"
            type="datetime-local"
            defaultValue={values.to ?? ""}
            className="rounded-lg"
          />
        </Field>
      </FieldGroup>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" className="rounded-full">
          Filter
        </Button>
        <a
          href="/admin/audit"
          className={buttonVariants({
            variant: "ghost",
            className: "rounded-full",
          })}
        >
          Clear
        </a>
      </div>
    </form>
  );
}
