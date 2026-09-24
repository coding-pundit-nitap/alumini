import Link from "next/link";

import { Wordmark } from "@/components/brand/dawn-mark";

const HOME_LINK =
  "focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:outline-none";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <aside className="bg-primary text-primary-foreground relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="dawn-glow absolute inset-0 -scale-y-100" />
        <Link href="/" className={`relative self-start ${HOME_LINK}`}>
          <Wordmark />
        </Link>
        <blockquote className="font-display relative max-w-lg text-4xl leading-tight text-balance">
          Every sunrise in Arunachal starts a little earlier. So does your
          network.
        </blockquote>
        <p className="text-primary-foreground/70 relative text-sm">
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
