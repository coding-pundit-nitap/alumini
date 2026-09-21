import { buttonVariants } from "@nitap/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard, ResendVerification } from "@/modules/auth";

export const metadata: Metadata = { title: "Confirm your email" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * Renders the OUTCOME only. The emailed link goes to Better Auth's GET /api/auth/verify-email, which
 * verifies and redirects here with `?status=confirmed`, or with `&error=TOKEN_EXPIRED|INVALID_TOKEN`.
 * The token never reaches this page.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const error = first(params.error);
  const confirmed = first(params.status) === "confirmed" && !error;

  if (confirmed) {
    return (
      <AuthCard
        title="Email confirmed"
        description="Your email address is confirmed."
      >
        <Link href="/login" className={buttonVariants()}>
          Continue to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={
        error === "TOKEN_EXPIRED"
          ? "This link has expired"
          : "This link is not valid"
      }
      description="Confirmation links expire after 60 minutes. Request a new one below."
    >
      <ResendVerification />
    </AuthCard>
  );
}
