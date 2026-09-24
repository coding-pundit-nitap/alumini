"use client";

import "./globals.css";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global critical error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-foreground dawn-glow flex min-h-svh flex-col items-center justify-center p-4 font-sans">
        <main className="max-w-md text-center">
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">
            Critical Application Error
          </h1>
          <p className="text-muted-foreground mt-3 text-sm">
            A fatal error occurred in the root layout.
          </p>
          {error.digest && (
            <p className="text-muted-foreground mt-2 font-mono text-xs">
              Reference: {error.digest}. Quote this if you contact support.
            </p>
          )}
          <button
            onClick={() => reset()}
            className="bg-primary text-primary-foreground focus-visible:ring-ring mt-8 rounded-lg px-4 py-2 text-sm font-medium transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Restart Application
          </button>
        </main>
      </body>
    </html>
  );
}
