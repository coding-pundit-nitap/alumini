import Link from "next/link";
import { buttonVariants } from "@nitap/ui/components/button";

import { PublicShell } from "@/components/common/public-shell";

export default function NotFound() {
  return (
    <PublicShell signedIn={false}>
      <section className="dawn-glow flex min-h-[70vh] flex-col items-center justify-center px-4 py-20 text-center">
        <p
          aria-hidden
          className="font-display text-brand text-8xl leading-none italic"
        >
          404
        </p>
        <h1 className="font-display mt-4 text-4xl tracking-tight md:text-5xl">
          Page not found
        </h1>
        <p className="text-muted-foreground mt-3 max-w-md">
          The page you are looking for does not exist or might have been moved.
        </p>
        <Link href="/" className={`${buttonVariants()} mt-8`}>
          Return to Homepage
        </Link>
      </section>
    </PublicShell>
  );
}
