import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { AuthCard, ResendVerification } from "@/modules/auth";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { email: raw } = await searchParams;
  const parsed = z.email().safeParse(Array.isArray(raw) ? raw[0] : raw);
  const email = parsed.success ? parsed.data : undefined;

  return (
    <AuthCard
      title="Check your email"
      description={
        email
          ? `We sent a confirmation link to ${email}.`
          : "We sent you a confirmation link."
      }
      footer={
        <Link href="/register" className="text-foreground underline">
          Wrong address? Register again
        </Link>
      }
    >
      <p className="text-sm">
        Open the link in that email to confirm your address. It is valid for 60
        minutes. If nothing arrives, check your spam folder or send a new link.
      </p>
      <ResendVerification email={email} />
    </AuthCard>
  );
}
