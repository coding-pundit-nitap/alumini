"use client";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { Textarea } from "@nitap/ui/components/textarea";
import { cn } from "@nitap/ui/lib/utils";
import { useId, useState } from "react";

import type { ActionResult } from "@/lib/action-result";

import { CATEGORIES, CATEGORY, type Category } from "../labels";

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;

type SubmitAction = (input: {
  title: string;
  description: string;
  category: Category;
}) => Promise<ActionResult<{ achievementId: string }>>;

/** The submission form (FR-ACH-001), matching `achievementInput`'s bounds. */
export function AchievementForm({ onSubmit }: { onSubmit: SubmitAction }) {
  const titleId = useId();
  const descriptionId = useId();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("AWARD");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const canSubmit =
    trimmedTitle.length > 0 &&
    trimmedTitle.length <= MAX_TITLE &&
    trimmedDescription.length > 0 &&
    trimmedDescription.length <= MAX_DESCRIPTION &&
    !submitting;

  async function onFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSent(false);
    const result = await onSubmit({
      title: trimmedTitle,
      description: trimmedDescription,
      category,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setSent(true);
    setTitle("");
    setDescription("");
    setCategory("AWARD");
  }

  return (
    <form
      onSubmit={onFormSubmit}
      className="bg-card space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="space-y-0.5">
        <h2 className="font-semibold tracking-tight">Share an achievement</h2>
        <p className="text-muted-foreground text-xs">
          A reviewer checks it first. Once approved it is posted to the feed.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Category</legend>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((option) => {
            const { label, icon: Icon } = CATEGORY[option];
            const active = option === category;
            return (
              <label
                key={option}
                className={cn(
                  "has-focus-visible:ring-ring/60 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors has-focus-visible:ring-2",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <input
                  type="radio"
                  name="category"
                  value={option}
                  checked={active}
                  onChange={() => setCategory(option)}
                  className="sr-only"
                />
                <Icon aria-hidden className="size-3.5" />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor={titleId} className="text-sm font-medium">
          Title
        </label>
        <Input
          id={titleId}
          value={title}
          maxLength={MAX_TITLE}
          placeholder="Best Paper Award at ICSE 2026"
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={descriptionId} className="text-sm font-medium">
          Description
        </label>
        <Textarea
          id={descriptionId}
          value={description}
          maxLength={MAX_DESCRIPTION}
          rows={4}
          aria-describedby={`${descriptionId}-count`}
          placeholder="What happened, and what it means to you."
          onChange={(event) => setDescription(event.target.value)}
        />
        <p
          id={`${descriptionId}-count`}
          className="text-muted-foreground text-right text-xs tabular-nums"
        >
          {description.length} / {MAX_DESCRIPTION}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {error ? (
          <p role="alert" className="text-destructive mr-auto text-sm">
            {error}
          </p>
        ) : sent ? (
          <p role="status" className="text-success mr-auto text-sm">
            Submitted. It&apos;s waiting for review.
          </p>
        ) : null}
        <Button
          type="submit"
          className="rounded-full px-5"
          disabled={!canSubmit}
        >
          {submitting ? "Submitting…" : "Submit"}
        </Button>
      </div>
    </form>
  );
}
