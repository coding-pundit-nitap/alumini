"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@nitap/ui/components/button";
import { AlertTriangle } from "lucide-react";

import { PublicShell } from "@/components/common/public-shell";

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
    // reaches the browser console until a client error tracker exists.
    console.error("Application runtime error:", error);
  }, [error]);

  return (
    <PublicShell signedIn={false}>
      <section className="dawn-glow flex min-h-[70vh] flex-col items-center justify-center px-4 py-20 text-center">
        <AlertTriangle aria-hidden className="text-brand size-10" />
        <h1 className="font-display mt-4 text-4xl tracking-tight md:text-5xl">
          Something went wrong
        </h1>
        <p className="text-muted-foreground mt-3 max-w-md">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p className="text-muted-foreground mt-2 font-mono text-xs">
            Reference: {error.digest}. Quote this if you contact support.
          </p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button onClick={() => reset()} variant="default">
            Try again
          </Button>
          <Button onClick={() => router.push("/")} variant="outline">
            Go to Homepage
          </Button>
        </div>
      </section>
    </PublicShell>
  );
}
