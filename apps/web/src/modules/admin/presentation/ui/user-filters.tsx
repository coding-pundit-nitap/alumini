import Link from "next/link";

import { Button, buttonVariants } from "@nitap/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@nitap/ui/components/field";
import { Input } from "@nitap/ui/components/input";

import { SELECT_CLASS, STATE_LABEL } from "./labels";

/** A plain GET form, like the audit filters: works without JavaScript and gives a shareable URL. */
export function UserFilters({
  values,
  roles,
}: {
  values: Record<string, string>;
  roles: readonly string[];
}) {
  return (
    <form method="get">
      <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="q">Search</FieldLabel>
          <Input
            id="q"
            name="q"
            defaultValue={values.q ?? ""}
            placeholder="Name or email starts with…"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="state">State</FieldLabel>
          <select
            id="state"
            name="state"
            defaultValue={values.state ?? ""}
            className={SELECT_CLASS}
          >
            <option value="">Any</option>
            {Object.entries(STATE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="role">Role</FieldLabel>
          <select
            id="role"
            name="role"
            defaultValue={values.role ?? ""}
            className={SELECT_CLASS}
          >
            <option value="">Any</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field orientation="horizontal">
          <Button type="submit">Filter</Button>
          <Link
            href="/admin/users"
            className={buttonVariants({ variant: "ghost" })}
          >
            Clear
          </Link>
        </Field>
      </FieldGroup>
    </form>
  );
}
