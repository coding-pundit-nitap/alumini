import Link from "next/link";
import { Search } from "lucide-react";

import { Button, buttonVariants } from "@nitap/ui/components/button";
import { Field, FieldLabel } from "@nitap/ui/components/field";
import { Input } from "@nitap/ui/components/input";

import { cn } from "@/lib/utils";

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
    <form method="get" className="flex flex-wrap items-end gap-3">
      <Field className="w-auto">
        <FieldLabel htmlFor="q" className="sr-only">
          Search
        </FieldLabel>
        <div className="bg-muted/50 flex items-center gap-2 rounded-full border px-3">
          <Search aria-hidden className="text-muted-foreground size-4" />
          <Input
            id="q"
            name="q"
            defaultValue={values.q ?? ""}
            placeholder="Name or email contains…"
            className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>
      </Field>
      <Field className="w-auto">
        <FieldLabel htmlFor="state">State</FieldLabel>
        <select
          id="state"
          name="state"
          defaultValue={values.state ?? ""}
          className={cn(SELECT_CLASS, "rounded-full px-3")}
        >
          <option value="">Any</option>
          {Object.entries(STATE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field className="w-auto">
        <FieldLabel htmlFor="role">Role</FieldLabel>
        <select
          id="role"
          name="role"
          defaultValue={values.role ?? ""}
          className={cn(SELECT_CLASS, "rounded-full px-3")}
        >
          <option value="">Any</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>
      <Field orientation="horizontal" className="w-auto">
        <Button type="submit" className="rounded-full">
          Filter
        </Button>
        <Link
          href="/admin/users"
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
