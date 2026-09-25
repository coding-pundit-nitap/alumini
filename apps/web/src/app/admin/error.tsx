"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button, buttonVariants } from "@nitap/ui/components/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="bg-muted flex size-12 items-center justify-center rounded-full">
        <AlertTriangle aria-hidden className="text-muted-foreground size-5" />
      </div>
      <div>
        <p className="text-sm font-medium">Something went wrong</p>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          This page could not load. Try again, or go back to the dashboard.
        </p>
        {error.digest && (
          <p className="text-muted-foreground mt-2 font-mono text-xs">
            Reference: {error.digest}
          </p>
        )}
      </div>
      <div className="mt-2 flex justify-center gap-2">
        <Button onClick={() => reset()} className="rounded-full">
          Try again
        </Button>
        <Link
          href="/admin"
          className={buttonVariants({
            variant: "outline",
            className: "rounded-full",
          })}
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
