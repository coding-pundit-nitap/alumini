"use client";

import * as React from "react";
import { z } from "zod";

import { QueryProvider } from "./query-provider";

// Zod probes for a JIT with `Function("")`; the page CSP forbids eval (spec 16 SD-1), so every page would
// report a violation. Its interpreter is the same validation without the probe.
z.config({ jitless: true });

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return <QueryProvider>{children}</QueryProvider>;
}
