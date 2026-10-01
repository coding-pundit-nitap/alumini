"use client";

import { Button } from "@nitap/ui/components/button";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { PASSWORD_MIN_LENGTH } from "../../domain/password-policy";
import { registerSchema, validate, type FieldErrors } from "../api/schemas";
import { authClient } from "../auth-client";
import { authErrorMessage } from "./auth-errors";
import { VERIFY_EMAIL_CALLBACK } from "./callbacks";
import { FormField, FormMessage } from "./form-field";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(registerSchema, { name, email, password });
    if (!result.ok) {
      setErrors(result.errors);
      setFormError(null);
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);

    const { error } = await authClient.signUp.email({
      ...result.data,
      callbackURL: VERIFY_EMAIL_CALLBACK,
    });
    setPending(false);

    // An address that already has an account gets the same screen as a new one; its owner is told by
    // email instead (enumeration protection, UI/UX spec §5.1.3).
    if (error && error.code !== "USER_ALREADY_EXISTS") {
      setFormError(authErrorMessage(error));
      return;
    }
    router.push(
      `/register/check-email?email=${encodeURIComponent(result.data.email)}`
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField
        label="Full name"
        name="name"
        value={name}
        onChange={setName}
        error={errors.name}
        autoComplete="name"
      />
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
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        autoComplete="new-password"
      />
      {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
