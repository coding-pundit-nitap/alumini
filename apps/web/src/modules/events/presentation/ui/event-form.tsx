"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription } from "@nitap/ui/components/alert";
import { Button } from "@nitap/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@nitap/ui/components/field";
import { Input } from "@nitap/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nitap/ui/components/select";
import { Spinner } from "@nitap/ui/components/spinner";
import { Switch } from "@nitap/ui/components/switch";
import { Textarea } from "@nitap/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import type { ActionResult } from "@/lib/action-result";

import {
  EVENT_CAPACITY_MAX,
  EVENT_CAPACITY_MIN,
  eventFormSchema,
  type EventFormValues,
} from "../../domain/validation";

/** The API names two fields differently from the form; map server details back onto the form. */
const FORM_FIELD: Record<string, keyof EventFormValues> = {
  startsAt: "startsLocal",
  registrationDeadline: "deadlineLocal",
};

/** Create an event (FR-EVENT-001, spec "UI"). The server stays authoritative for the date rules. */
export function EventForm({
  createAction,
}: {
  createAction: (
    values: EventFormValues
  ) => Promise<ActionResult<{ eventId: string }>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      startsLocal: "",
      deadlineLocal: "",
      timezone: "",
      isOnline: false,
      location: "",
    },
  });
  const { errors } = form.formState;
  const isOnline = useWatch({ control: form.control, name: "isOnline" });
  const timezone = useWatch({ control: form.control, name: "timezone" });

  // The browser's zone is only known on the client; setting it after mount avoids a hydration mismatch.
  useEffect(() => {
    if (!form.getValues("timezone")) {
      form.setValue(
        "timezone",
        Intl.DateTimeFormat().resolvedOptions().timeZone
      );
    }
  }, [form]);

  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf("timeZone");
    const list = timezone && !all.includes(timezone) ? [timezone, ...all] : all;
    return list.map((zone) => ({
      label: zone.replaceAll("_", " "),
      value: zone,
    }));
  }, [timezone]);

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createAction(values);
      if (result.ok) {
        router.push(`/events/${result.data.eventId}`);
        return;
      }
      let placed = false;
      for (const [field, message] of Object.entries(
        result.error.fields ?? {}
      )) {
        const name = FORM_FIELD[field] ?? field;
        if (name in values) {
          form.setError(name as keyof EventFormValues, { message });
          placed = true;
        }
      }
      if (!placed) setServerError(result.error.message);
    });
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor="event-title">Title</FieldLabel>
          <Input
            id="event-title"
            aria-invalid={!!errors.title}
            {...form.register("title")}
          />
          <FieldError errors={[errors.title]} />
        </Field>

        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor="event-description">Description</FieldLabel>
          <Textarea
            id="event-description"
            rows={5}
            aria-invalid={!!errors.description}
            {...form.register("description")}
          />
          <FieldError errors={[errors.description]} />
        </Field>

        <Field data-invalid={!!errors.startsLocal}>
          <FieldLabel htmlFor="event-starts">Starts</FieldLabel>
          <Input
            id="event-starts"
            type="datetime-local"
            aria-invalid={!!errors.startsLocal}
            {...form.register("startsLocal")}
          />
          <FieldError errors={[errors.startsLocal]} />
        </Field>

        <Field data-invalid={!!errors.deadlineLocal}>
          <FieldLabel htmlFor="event-deadline">Registration closes</FieldLabel>
          <Input
            id="event-deadline"
            type="datetime-local"
            aria-invalid={!!errors.deadlineLocal}
            {...form.register("deadlineLocal")}
          />
          <FieldDescription>At or before the start time.</FieldDescription>
          <FieldError errors={[errors.deadlineLocal]} />
        </Field>

        <Controller
          control={form.control}
          name="timezone"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="event-timezone">Time zone</FieldLabel>
              <Select
                items={zones}
                value={field.value}
                onValueChange={(value) => field.onChange(value ?? "")}
              >
                <SelectTrigger
                  id="event-timezone"
                  className="w-full"
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {zones.map((zone) => (
                      <SelectItem key={zone.value} value={zone.value}>
                        {zone.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                The start time and deadline are in this zone.
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="isOnline"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch
                id="event-online"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <FieldLabel htmlFor="event-online">Online event</FieldLabel>
            </Field>
          )}
        />

        {isOnline ? null : (
          <Field data-invalid={!!errors.location}>
            <FieldLabel htmlFor="event-location">Location</FieldLabel>
            <Input
              id="event-location"
              aria-invalid={!!errors.location}
              {...form.register("location")}
            />
            <FieldError errors={[errors.location]} />
          </Field>
        )}

        <Field data-invalid={!!errors.capacity}>
          <FieldLabel htmlFor="event-capacity">Capacity</FieldLabel>
          <Input
            id="event-capacity"
            type="number"
            inputMode="numeric"
            min={EVENT_CAPACITY_MIN}
            max={EVENT_CAPACITY_MAX}
            aria-invalid={!!errors.capacity}
            {...form.register("capacity", { valueAsNumber: true })}
          />
          <FieldError errors={[errors.capacity]} />
        </Field>

        {serverError ? (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Create event
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
