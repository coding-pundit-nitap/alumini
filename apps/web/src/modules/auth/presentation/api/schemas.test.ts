import { describe, expect, it } from "vitest";

import {
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  validate,
} from "./schemas";

describe("registerSchema", () => {
  const valid = {
    name: "Asha Rao",
    email: "asha@example.test",
    password: "correct-horse-battery",
  };

  it("accepts valid input and trims the name", () => {
    const result = validate(registerSchema, { ...valid, name: "  Asha Rao " });
    expect(result).toEqual({ ok: true, data: valid });
  });

  it("reports one message per field", () => {
    const result = validate(registerSchema, {
      name: " ",
      email: "nope",
      password: "short",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "email",
        "name",
        "password",
      ]);
      expect(result.errors.password).toMatch(/at least 10/);
    }
  });

  it("rejects a password longer than 128 characters", () => {
    const result = validate(registerSchema, {
      ...valid,
      password: "x".repeat(129),
    });
    expect(result.ok).toBe(false);
  });
});

describe("loginSchema", () => {
  it("does not apply the new-password length rule to an existing password", () => {
    expect(
      validate(loginSchema, { email: "a@example.test", password: "short" }).ok
    ).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  it("requires the confirmation to match", () => {
    const result = validate(resetPasswordSchema, {
      newPassword: "correct-horse-battery",
      confirmPassword: "different-horse-battery",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.confirmPassword).toMatch(/match/);
  });
});
