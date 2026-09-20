import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startSmtpTestServer, type SmtpTestServer } from "@nitap/testing";

import { EmailSendError } from "./port.ts";
import { createSmtpEmailPort } from "./smtp.ts";

const message = {
  to: "person@example.test",
  subject: "Hello there",
  text: "Body text",
};

describe("SMTP email adapter (real SMTP server)", () => {
  let server: SmtpTestServer;
  const ports: Array<{ close(): void }> = [];

  const portFor = (url: string, over: Record<string, number> = {}) => {
    const port = createSmtpEmailPort({
      url,
      from: "Alumni <no-reply@alumni.test>",
      ...over,
    });
    ports.push(port);
    return port;
  };

  beforeEach(async () => {
    server = await startSmtpTestServer();
  });
  afterEach(async () => {
    ports.splice(0).forEach((p) => p.close());
    await server.close();
  });

  it("delivers the message with the configured sender and a stable Message-ID", async () => {
    await portFor(server.url).send(message, { messageKey: "event-42" });

    expect(server.received).toHaveLength(1);
    const mail = server.received[0]!;
    expect(mail.to).toEqual(["person@example.test"]);
    expect(mail.from).toBe("no-reply@alumni.test");
    expect(mail.raw).toContain("Subject: Hello there");
    expect(mail.raw).toContain("Body text");
    expect(mail.raw).toMatch(/Message-ID: <event-42@/i);
  });

  it("classifies a 4xx answer as retryable", async () => {
    server.setMode("reject-transient");
    const error = await portFor(server.url)
      .send(message)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as EmailSendError).kind).toBe("retryable");
  });

  it("classifies a 5xx answer as permanent, without leaking the address into the message", async () => {
    server.setMode("reject-permanent");
    const error = (await portFor(server.url)
      .send(message)
      .catch((e: unknown) => e)) as EmailSendError;
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error.kind).toBe("permanent");
    expect(error.message).not.toContain("person@example.test");
  });

  it("classifies a refused connection as retryable", async () => {
    const url = server.url;
    await server.close();
    const error = await portFor(url)
      .send(message)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as EmailSendError).kind).toBe("retryable");
    server = await startSmtpTestServer(); // so afterEach can close a live one
  });

  it("gives up on a server that stops answering, as retryable, within the socket timeout", async () => {
    server.setMode("hang");
    const started = Date.now();
    const error = await portFor(server.url, {
      socketTimeoutMs: 300,
      greetingTimeoutMs: 300,
      connectionTimeoutMs: 300,
    })
      .send(message)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as EmailSendError).kind).toBe("retryable");
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("refuses to send when already aborted, as retryable", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await portFor(server.url)
      .send(message, { signal: controller.signal })
      .catch((e: unknown) => e);
    expect((error as EmailSendError).kind).toBe("retryable");
    expect(server.received).toHaveLength(0);
  });
});
