import type { Redis } from "ioredis";

import {
  messageHintChannel,
  notificationHintChannel,
  type MessageHint,
  type NotificationHint,
} from "@nitap/jobs";

export type HintPublisher = {
  publish(userId: string, hint: MessageHint): Promise<void>;
};

/** Publishes a hint on the member's channel. Fire-and-forget by nature: a subscriber that is away just refetches. */
export function createRedisHintPublisher(
  redis: Pick<Redis, "publish">
): HintPublisher {
  return {
    async publish(userId, hint) {
      await redis.publish(messageHintChannel(userId), JSON.stringify(hint));
    },
  };
}

export type NotificationHintPublisher = {
  publish(userId: string, hint: NotificationHint): Promise<void>;
};

/** Same fire-and-forget contract as the message hints, on the notification channel. */
export function createNotificationHintPublisher(
  redis: Pick<Redis, "publish">
): NotificationHintPublisher {
  return {
    async publish(userId, hint) {
      await redis.publish(
        notificationHintChannel(userId),
        JSON.stringify(hint)
      );
    },
  };
}
