import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@nitap/ui/components/button";

export function CtaButtons({ signedIn }: { signedIn: boolean }) {
  if (signedIn) {
    return (
      <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
        Go to dashboard
      </Link>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      <Link href="/register" className={buttonVariants({ size: "lg" })}>
        Join the network
        <ArrowRight aria-hidden className="size-4" />
      </Link>
      <Link
        href="/login"
        className={buttonVariants({ size: "lg", variant: "outline" })}
      >
        Log in
      </Link>
    </div>
  );
}
