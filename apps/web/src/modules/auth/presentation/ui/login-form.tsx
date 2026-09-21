"use client";

import { Button } from "@nitap/ui/components/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { loginSchema, validate, type FieldErrors } from "../api/schemas";
import { authClient } from "../auth-client";
import { authErrorMessage } from "./auth-errors";
import { FormField, FormMessage } from "./form-field";
import { ResendVerification } from "./resend-verification";

export function LoginForm({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(loginSchema, { email, password });
    if (!result.ok) {
      setErrors(result.errors);
      setFormError(null);
      return;
    }
    setErrors({});
    setFormError(null);
    setNeedsConfirmation(false);
    setPending(true);

    const { error } = await authClient.signIn.email(result.data);
    setPending(false);

    if (error) {
      setFormError(authErrorMessage(error));
      setNeedsConfirmation(error.code === "EMAIL_NOT_VERIFIED");
      return;
    }
    // The server decides where this person lands, from their account state (/post-login).
    router.push(`/post-login?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          error={errors.email}
          autoComplete="email"
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          autoComplete="current-password"
        />
        {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {needsConfirmation ? <ResendVerification email={email} /> : null}
      <p className="text-sm">
        <Link href="/forgot-password" className="underline">
          Forgot your password?
        </Link>
      </p>
    </div>
  );
}
