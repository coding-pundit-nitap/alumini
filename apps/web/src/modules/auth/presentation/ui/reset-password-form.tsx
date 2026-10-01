"use client";

import { Button, buttonVariants } from "@nitap/ui/components/button";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { PASSWORD_MIN_LENGTH } from "../../domain/password-policy";
import {
  resetPasswordSchema,
  validate,
  type FieldErrors,
} from "../api/schemas";
import { authClient } from "../auth-client";
import { authErrorMessage } from "./auth-errors";
import { FormField, FormMessage } from "./form-field";

export function ResetPasswordForm({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(resetPasswordSchema, {
      newPassword,
      confirmPassword,
    });
    if (!result.ok) {
      setErrors(result.errors);
      setFormError(null);
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    const { error } = await authClient.resetPassword({
      newPassword: result.data.newPassword,
      token,
    });
    setPending(false);

    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <FormMessage tone="success">
          Your password has been changed. You were signed out on other devices.
        </FormMessage>
        <Link href="/login" className={buttonVariants()}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField
        label="New password"
        name="newPassword"
        type="password"
        value={newPassword}
        onChange={setNewPassword}
        error={errors.newPassword}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        autoComplete="new-password"
      />
      <FormField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        error={errors.confirmPassword}
        autoComplete="new-password"
      />
      {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
