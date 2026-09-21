import { Redis } from "ioredis";
import { afterEach, describe, expect, it } from "vitest";

import { MESSAGE_HINT_PREFIX, messageHintChannel } from "@nitap/jobs";

import { createRedisHintPublisher } from "../src/hints.ts";

describe("hint publisher against real Redis", () => {
  const clients: Redis[] = [];
  afterEach(() => {
    clients.splice(0).forEach((c) => c.disconnect());
  });

  it("a subscriber on the user's channel receives the hint JSON, and no other user's channel does", async () => {
    const url = process.env.REDIS_URL!;
    const publisherRedis = new Redis(url);
    const subscriber = new Redis(url);
    clients.push(publisherRedis, subscriber);
    const received: { channel: string; message: string }[] = [];
    subscriber.on("message", (channel, message) =>
      received.push({ channel, message })
    );
    await subscriber.subscribe(messageHintChannel("user-1"));

    const publisher = createRedisHintPublisher(publisherRedis);
    const hint = { conversationId: "c1", messageId: "m1" };
    await publisher.publish("user-1", hint);
    await publisher.publish("user-2", hint);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(received).toEqual([
      {
        channel: `${MESSAGE_HINT_PREFIX}user-1`,
        message: JSON.stringify(hint),
      },
    ]);
  });
});
