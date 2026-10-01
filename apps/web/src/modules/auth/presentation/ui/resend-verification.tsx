"use client";

import { Button } from "@nitap/ui/components/button";
import { useState, type FormEvent } from "react";

import { resendVerificationSchema, validate } from "../api/schemas";
import { authClient } from "../auth-client";
import { authErrorMessage } from "./auth-errors";
import { VERIFY_EMAIL_CALLBACK } from "./callbacks";
import { FormField, FormMessage } from "./form-field";

/**
 * Sends a fresh confirmation link. The confirmation text is the same whether or not the address has an
 * account that needs confirming; only a rate limit is reported differently.
 */
export function ResendVerification({ email: knownEmail }: { email?: string }) {
  const [typed, setTyped] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(resendVerificationSchema, {
      email: knownEmail ?? typed,
    });
    if (!result.ok) {
      setFieldError(result.errors.email);
      return;
    }
    setFieldError(undefined);
    setPending(true);
    const { error } = await authClient.sendVerificationEmail({
      email: result.data.email,
      callbackURL: VERIFY_EMAIL_CALLBACK,
    });
    setPending(false);

    if (error?.status === 429) {
      setState("error");
      setMessage(authErrorMessage(error));
      return;
    }
    setState("sent");
    setMessage(
      "If this address needs confirming, we have sent a new link. It can take a few minutes to arrive."
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-3">
      {knownEmail ? null : (
        <FormField
          label="Email"
          name="email"
          type="email"
          value={typed}
          onChange={setTyped}
          error={fieldError}
          autoComplete="email"
        />
      )}
      {message ? (
        <FormMessage tone={state === "error" ? "error" : "success"}>
          {message}
        </FormMessage>
      ) : null}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Sending…" : "Send a new link"}
      </Button>
    </form>
  );
}
