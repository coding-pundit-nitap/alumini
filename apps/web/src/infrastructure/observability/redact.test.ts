import { describe, it, expect } from "vitest";
import { REDACTED, redact } from "./redact";

describe("redact (reliability §6.4)", () => {
  it("masks every secret-bearing key in a fixture, at any depth", () => {
    const fixture = {
      password: "hunter2",
      newPassword: "hunter3",
      token: "abc",
      accessToken: "abc",
      refreshToken: "abc",
      verificationToken: "abc",
      secret: "s",
      BETTER_AUTH_SECRET: "s",
      apiKey: "k",
      api_key: "k",
      authorization: "Bearer abc",
      Authorization: "Bearer abc",
      cookie: "session=abc",
      "set-cookie": "session=abc",
      body: { anything: "user message" },
      messageBody: "hello",
      resetLink: "https://x/reset?token=abc",
      nested: { deeper: [{ password: "p", safe: "ok" }] },
    };

    const result = redact(fixture) as Record<string, unknown>;
    const json = JSON.stringify(result);

    for (const leaked of [
      "hunter2",
      "hunter3",
      "Bearer",
      "session=abc",
      "user message",
      "hello",
      "reset?token",
    ]) {
      expect(json).not.toContain(leaked);
    }
    expect(result.password).toBe(REDACTED);
    expect(result["set-cookie"]).toBe(REDACTED);
    expect(
      (result.nested as { deeper: { safe: string }[] }).deeper[0].safe
    ).toBe("ok");
  });

  it("keeps identifiers and outcomes", () => {
    expect(redact({ user_id: "u1", status: 200, event_id: "e1" })).toEqual({
      user_id: "u1",
      status: 200,
      event_id: "e1",
    });
  });

  it("does not mutate its input", () => {
    const input = { password: "p" };
    redact(input);
    expect(input.password).toBe("p");
  });

  it("survives circular references and deep nesting", () => {
    const loop: Record<string, unknown> = { name: "a" };
    loop.self = loop;
    expect(() => JSON.stringify(redact(loop))).not.toThrow();

    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 50; i++) deep = { child: deep };
    expect(() => JSON.stringify(redact(deep))).not.toThrow();
  });

  it("serialises errors with name, message, code and cause, masking secrets in the message-free fields", () => {
    const cause = new Error("db down");
    const error = Object.assign(new Error("failed", { cause }), {
      code: "P1001",
      token: "abc",
    });
    const result = redact(error) as Record<string, unknown>;
    expect(result).toMatchObject({
      name: "Error",
      message: "failed",
      code: "P1001",
      cause: { name: "Error", message: "db down" },
    });
    expect(JSON.stringify(result)).not.toContain("abc");
  });
});
