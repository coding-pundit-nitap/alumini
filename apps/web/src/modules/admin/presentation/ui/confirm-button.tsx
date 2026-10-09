"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@nitap/ui/components/alert-dialog";
import { Button } from "@nitap/ui/components/button";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";

import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

export type AccessAction = (
  formData: FormData
) => Promise<ActionResult<unknown>>;

/**
 * Confirms, posts `fields` to a Server Action and refreshes on success. The
 * server takes the actor from the session.
 */
export function ConfirmButton(props: {
  label: string;
  variant?: "default" | "destructive" | "outline";
  title: string;
  description: ReactNode;
  confirmLabel: string;
  fields: Record<string, string | undefined>;
  /** False while a required input inside `children` is still empty. */
  ready?: boolean;
  disabledReason?: string | undefined;
  action: AccessAction;
  /**
   * Called whenever the dialog closes, so a form inside it starts empty next
   * time.
   */
  onClose?: () => void;
  children?: ReactNode;
}) {
  const router = useRouter();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) return;
    setError(null);
    props.onClose?.();
  }

  function submit() {
    const form = new FormData();
    for (const [key, value] of Object.entries(props.fields))
      if (value !== undefined && value !== "") form.set(key, value);
    startTransition(async () => {
      const result = await props.action(form);
      if (!result.ok) {
        setError(
          Object.values(result.error.fields ?? {})[0] ?? result.error.message
        );
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant={
                props.variant === "destructive"
                  ? "outline"
                  : (props.variant ?? "outline")
              }
              className={cn(
                "rounded-full",
                props.variant === "destructive" &&
                  "text-destructive hover:bg-destructive/10"
              )}
              disabled={props.disabledReason !== undefined}
              aria-describedby={props.disabledReason ? reasonId : undefined}
            />
          }
        >
          {props.label}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{props.title}</AlertDialogTitle>
            <AlertDialogDescription>{props.description}</AlertDialogDescription>
          </AlertDialogHeader>
          {props.children}
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={
                props.variant === "destructive" ? "destructive" : "default"
              }
              disabled={pending || props.ready === false}
              onClick={submit}
            >
              {props.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {props.disabledReason ? (
        <p id={reasonId} className="text-muted-foreground text-xs">
          {props.disabledReason}
        </p>
      ) : null}
    </div>
  );
}
