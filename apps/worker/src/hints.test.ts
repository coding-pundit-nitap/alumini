import { describe, expect, it, vi } from "vitest";

import {
  createNotificationHintPublisher,
  createRedisHintPublisher,
} from "./hints.ts";

describe("hint publishers", () => {
  it("publishes notification hints on notif:user: and message hints on msg:user:", async () => {
    const redis = { publish: vi.fn(async () => 1) };
    await createNotificationHintPublisher(redis).publish("u1", {
      notificationId: "n1",
    });
    await createRedisHintPublisher(redis).publish("u1", {
      conversationId: "c",
      messageId: "m",
    });
    expect(redis.publish).toHaveBeenNthCalledWith(
      1,
      "notif:user:u1",
      '{"notificationId":"n1"}'
    );
    expect(redis.publish).toHaveBeenNthCalledWith(
      2,
      "msg:user:u1",
      '{"conversationId":"c","messageId":"m"}'
    );
  });
});
