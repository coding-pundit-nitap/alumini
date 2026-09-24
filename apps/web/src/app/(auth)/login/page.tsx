import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/route-access";
import { getActor } from "@/modules/auth";
import { AuthCard, LoginForm } from "@/modules/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const actor = await getActor();
  const { next } = await searchParams;
  const safeNext = safeNextPath(typeof next === "string" ? next : undefined);
  if (actor?.accountState === "VERIFIED") redirect(safeNext);

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
