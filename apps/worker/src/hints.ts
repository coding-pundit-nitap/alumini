import type { Redis } from "ioredis";

import { messageHintChannel, type MessageHint } from "@nitap/jobs";

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
