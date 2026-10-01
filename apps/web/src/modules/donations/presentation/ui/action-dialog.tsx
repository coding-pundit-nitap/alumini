"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button } from "@nitap/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@nitap/ui/components/dialog";

import type { ActionResult } from "@/lib/action-result";

import { useDonationAction } from "./use-donation-action";

/**
 * A trigger that opens a form dialog, runs one Server Action on submit and refreshes the page on success.
 * The actor is never a field: the server takes the session's.
 */
export function ActionDialog(props: {
  trigger: string;
  triggerVariant?: "default" | "outline" | "ghost";
  title: string;
  description?: ReactNode;
  submitLabel: string;
  destructive?: boolean;
  ready?: boolean;
  submit: () => Promise<ActionResult<unknown>>;
  onClose?: () => void;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { pending, error, setError, run } = useDonationAction();
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setError(null);
      props.onClose?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant={props.triggerVariant ?? "outline"}
            className="rounded-full"
          />
        }
      >
        {props.trigger}
      </DialogTrigger>
      <DialogContent>
        <form
          method="post"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(props.submit, () => {
              onOpenChange(false);
              router.refresh();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            {props.description ? (
              <DialogDescription>{props.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          {props.children}
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              variant={props.destructive ? "destructive" : "default"}
              disabled={pending || props.ready === false}
            >
              {props.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
