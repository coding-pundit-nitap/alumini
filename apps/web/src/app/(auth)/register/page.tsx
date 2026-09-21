import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard, RegisterForm } from "@/modules/auth";

export const metadata: Metadata = { title: "Create your account" };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Join the NIT Arunachal Pradesh alumni network."
      footer={
        <span>
          Already have an account?{" "}
          <Link href="/login" className="text-foreground underline">
            Sign in
          </Link>
        </span>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
