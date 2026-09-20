"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@nitap/ui/components/button";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Server-side failures are already logged by instrumentation.ts (with this digest). This only
    // reaches the browser console until a client error tracker exists (Phase 13).
    console.error("Application runtime error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-4">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="bg-destructive/10 text-destructive mb-4 rounded-full p-4">
          <AlertTriangle className="size-10" />
        </div>
        <h2 className="text-foreground text-2xl font-bold tracking-tight">
          Something went wrong!
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p className="text-muted-foreground mt-2 font-mono text-xs">
            Reference: {error.digest}. Quote this if you contact support.
          </p>
        )}
        <div className="mt-6 flex gap-4">
          <Button onClick={() => reset()} variant="default">
            Try again
          </Button>
          <Button onClick={() => router.push("/")} variant="outline">
            Go to Homepage
          </Button>
        </div>
      </div>
    </div>
  );
}
