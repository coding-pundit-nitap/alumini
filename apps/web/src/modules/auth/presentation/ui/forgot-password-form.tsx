"use client";

import { Button } from "@nitap/ui/components/button";
import { useState, type FormEvent } from "react";

import { forgotPasswordSchema, validate } from "../api/schemas";
import { authClient } from "../auth-client";
import { authErrorMessage } from "./auth-errors";
import { RESET_PASSWORD_REDIRECT } from "./callbacks";
import { FormField, FormMessage } from "./form-field";

/** The confirmation is the same for every address; only a rate limit is reported differently. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [state, setState] = useState<"idle" | "sent" | "limited">("idle");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(forgotPasswordSchema, { email });
    if (!result.ok) {
      setFieldError(result.errors.email);
      return;
    }
    setFieldError(undefined);
    setPending(true);
    const { error } = await authClient.requestPasswordReset({
      email: result.data.email,
      redirectTo: RESET_PASSWORD_REDIRECT,
    });
    setPending(false);
    setState(error?.status === 429 ? "limited" : "sent");
  }

  if (state === "sent") {
    return (
      <FormMessage tone="success">
        If an account exists for that address, we have sent a link to reset the
        password. It is valid for 60 minutes.
      </FormMessage>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
        error={fieldError}
        autoComplete="email"
      />
      {state === "limited" ? (
        <FormMessage tone="error">
          {authErrorMessage({ status: 429 })}
        </FormMessage>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
