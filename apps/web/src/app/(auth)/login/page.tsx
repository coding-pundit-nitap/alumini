import type { Metadata } from "next";
import Link from "next/link";

import { safeNextPath } from "@/lib/route-access";
import { AuthCard, LoginForm } from "@/modules/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next } = await searchParams;
  const safeNext = safeNextPath(typeof next === "string" ? next : undefined);

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back to the NIT Arunachal Pradesh alumni network."
      footer={
        <span>
          New here?{" "}
          <Link href="/register" className="text-foreground underline">
            Create an account
          </Link>
        </span>
      }
    >
      <LoginForm next={safeNext} />
    </AuthCard>
  );
}
