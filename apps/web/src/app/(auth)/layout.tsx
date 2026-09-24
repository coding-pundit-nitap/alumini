import Link from "next/link";

import { Wordmark } from "@/components/brand/dawn-mark";

const HOME_LINK =
  "focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:outline-none";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <aside className="dark bg-background text-foreground relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="dawn-glow absolute inset-0 -scale-y-100" />
        <svg
          aria-hidden
          viewBox="0 0 600 200"
          preserveAspectRatio="none"
          className="absolute inset-x-0 bottom-0 h-56 w-full"
        >
          <circle cx="400" cy="150" r="60" fill="var(--brand)" opacity="0.35" />
          <polygon
            points="0,200 0,130 120,60 220,140 300,90 420,160 520,80 600,120 600,200"
            fill="currentColor"
            opacity="0.06"
          />
          <polygon
            points="0,200 0,170 90,120 200,175 330,110 460,180 560,140 600,160 600,200"
            fill="currentColor"
            opacity="0.1"
          />
        </svg>
        <Link href="/" className={`relative self-start ${HOME_LINK}`}>
          <Wordmark />
        </Link>
        <blockquote className="font-display relative max-w-lg text-4xl leading-tight text-balance">
          Every sunrise in Arunachal starts a little earlier. So does your
          network.
        </blockquote>
        <p className="text-muted-foreground relative text-sm">
          Verified by NIT Arunachal Pradesh
        </p>
      </aside>
      <main className="flex flex-col items-center justify-center gap-8 px-4 py-12">
        <Link href="/" className={`lg:hidden ${HOME_LINK}`}>
          <Wordmark compact />
        </Link>
        <div className="flex w-full max-w-md justify-center">{children}</div>
      </main>
    </div>
  );
}
