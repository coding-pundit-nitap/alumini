"use client";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { Textarea } from "@nitap/ui/components/textarea";
import { useId, useState } from "react";

import type { ActionResult } from "@/lib/action-result";

const CATEGORIES = [
  "AWARD",
  "PUBLICATION",
  "PROMOTION",
  "CERTIFICATION",
  "ENTREPRENEURSHIP",
  "OTHER",
] as const;
type Category = (typeof CATEGORIES)[number];

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
  const categoryId = useId();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("AWARD");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setTitle("");
    setDescription("");
    setCategory("AWARD");
  }

  return (
    <form onSubmit={onFormSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={titleId} className="text-sm font-medium">
          Title
        </label>
        <Input
          id={titleId}
          value={title}
          maxLength={MAX_TITLE}
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
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={categoryId} className="text-sm font-medium">
          Category
        </label>
        <select
          id={categoryId}
          value={category}
          onChange={(event) => setCategory(event.target.value as Category)}
          className="border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm"
        >
          {CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit}>
        {submitting ? "Submitting…" : "Submit"}
      </Button>
    </form>
  );
}
