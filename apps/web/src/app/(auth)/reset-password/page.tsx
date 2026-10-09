import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard, ResetPasswordForm } from "@/modules/auth";

export const metadata: Metadata = { title: "Choose a new password" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Better Auth's emailed link redirects here with `?token=` or `?error=INVALID_TOKEN`. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const token = first(params.token);
  const error = first(params.error);

  if (!token || error) {
    return (
      <AuthCard
        title="This link is not valid"
        description="Reset links expire after 60 minutes and work once. Request a new one."
      >
        <Link href="/forgot-password" className="text-foreground underline">
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      description="You will be signed out on all your other devices."
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
