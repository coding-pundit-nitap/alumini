import { describe, expect, it } from "vitest";

import type {
  MentorshipEvent,
  MentorshipStore,
} from "@/modules/mentorship/application/mentorship-store";

export type MentorConfig = {
  accepting: boolean;
  maxMentees: number;
  listable: boolean;
};

export type MentorshipStoreHarness = {
  store: MentorshipStore;
  seedMentor: (id: string, config: MentorConfig) => void;
  seedUser: (id: string) => void;
  seedBlock: (a: string, b: string) => void;
  /** Occupies `n` of the mentor's slots with ACCEPTED rows, for capacity assertions. */
  openSlotsTaker: (mentorId: string, n: number) => void;
  /** Optional: when the backing store can say, lets the suite confirm a rollback dropped the event too. */
  events?: () => MentorshipEvent[] | Promise<MentorshipEvent[]>;
};

/**
 * Behaviour every MentorshipStore must satisfy, run once against the fake and once (in a later task)
 * against the Prisma-backed store, so the two never drift (mirrors the connections module's approach
 * to keeping a port and its adapters honest).
 */
export function describeMentorshipStoreContract(
  name: string,
  factory: () => Promise<MentorshipStoreHarness>
) {
  describe(`MentorshipStore contract (${name})`, () => {
    it("insert returns a REQUESTED row; a duplicate open pair returns null; history and the reverse pair still work", async () => {
      const h = await factory();
      h.seedMentor("mentor-1", {
        accepting: true,
        maxMentees: 3,
        listable: true,
      });
      h.seedUser("mentee-1");

      const first = await h.store.transaction((tx) =>
        tx.insert({
          mentorId: "mentor-1",
          menteeId: "mentee-1",
          topic: null,
          message: "hi",
          requestedAt: new Date(),
        })
      );
      expect(first?.state).toBe("REQUESTED");

      const duplicate = await h.store.transaction((tx) =>
        tx.insert({
          mentorId: "mentor-1",
          menteeId: "mentee-1",
          topic: null,
          message: "hi again",
          requestedAt: new Date(),
        })
      );
      expect(duplicate).toBeNull();

      await h.store.transaction((tx) =>
        tx.update(first!.id, "REQUESTED", {
          state: "DECLINED",
          responseNote: null,
          respondedAt: new Date(),
          startedAt: null,
          endedAt: new Date(),
        })
      );

      const third = await h.store.transaction((tx) =>
        tx.insert({
          mentorId: "mentor-1",
          menteeId: "mentee-1",
          topic: null,
          message: "third try",
          requestedAt: new Date(),
        })
      );
      expect(third?.state).toBe("REQUESTED");

      const reverse = await h.store.transaction((tx) =>
        tx.insert({
          mentorId: "mentee-1",
          menteeId: "mentor-1",
          topic: null,
          message: "reverse pair",
          requestedAt: new Date(),
        })
      );
      expect(reverse?.state).toBe("REQUESTED");
    });

    it("update(id, from, patch) moves the row once; the same call again is guarded to null", async () => {
      const h = await factory();
      h.seedMentor("mentor-2", {
        accepting: true,
        maxMentees: 3,
        listable: true,
      });
      h.seedUser("mentee-2");

      const row = await h.store.transaction((tx) =>
        tx.insert({
          mentorId: "mentor-2",
          menteeId: "mentee-2",
          topic: null,
          message: "hi",
          requestedAt: new Date(),
        })
      );
      const patch = {
        state: "ACCEPTED" as const,
        responseNote: null,
        respondedAt: new Date(),
        startedAt: null,
        endedAt: null,
      };

      const first = await h.store.transaction((tx) =>
        tx.update(row!.id, "REQUESTED", patch)
      );
      expect(first?.state).toBe("ACCEPTED");

      const second = await h.store.transaction((tx) =>
        tx.update(row!.id, "REQUESTED", patch)
      );
      expect(second).toBeNull();
    });

    it("findById returns the row, null for an unknown id", async () => {
      const h = await factory();
      h.seedMentor("mentor-3", {
        accepting: true,
        maxMentees: 3,
        listable: true,
      });
      h.seedUser("mentee-3");

      const row = await h.store.transaction((tx) =>
        tx.insert({
          mentorId: "mentor-3",
          menteeId: "mentee-3",
          topic: null,
          message: "hi",
          requestedAt: new Date(),
        })
      );
      const found = await h.store.transaction((tx) => tx.findById(row!.id));
      expect(found?.id).toBe(row!.id);

      const missing = await h.store.transaction((tx) =>
        tx.findById("does-not-exist")
      );
      expect(missing).toBeNull();
    });

    it("lockMentorCapacity counts only ACCEPTED and ACTIVE rows; null without a mentor profile", async () => {
      const h = await factory();
      h.seedMentor("mentor-4", {
        accepting: true,
        maxMentees: 5,
        listable: true,
      });
      h.openSlotsTaker("mentor-4", 2);

      const capacity = await h.store.transaction((tx) =>
        tx.lockMentorCapacity("mentor-4")
      );
      expect(capacity).toEqual({ maxMentees: 5, openSlots: 2 });

      const missing = await h.store.transaction((tx) =>
        tx.lockMentorCapacity("no-such-mentor")
      );
      expect(missing).toBeNull();
    });

    it("blocked(a, b) is true for either direction, false otherwise", async () => {
      const h = await factory();
      h.seedUser("u1");
      h.seedUser("u2");
      h.seedUser("u3");
      h.seedBlock("u1", "u2");

      const ab = await h.store.transaction((tx) => tx.blocked("u1", "u2"));
      const ba = await h.store.transaction((tx) => tx.blocked("u2", "u1"));
      const none = await h.store.transaction((tx) => tx.blocked("u1", "u3"));

      expect(ab).toBe(true);
      expect(ba).toBe(true);
      expect(none).toBe(false);
    });

    it("a transaction that throws after insert + enqueue leaves no row and no event", async () => {
      const h = await factory();
      h.seedMentor("mentor-6", {
        accepting: true,
        maxMentees: 3,
        listable: true,
      });
      h.seedUser("mentee-6");

      let insertedId: string | undefined;
      await expect(
        h.store.transaction(async (tx) => {
          const row = await tx.insert({
            mentorId: "mentor-6",
            menteeId: "mentee-6",
            topic: null,
            message: "hi",
            requestedAt: new Date(),
          });
          insertedId = row?.id;
          await tx.enqueue({
            type: "mentorship.requested",
            payload: {
              v: 1,
              mentorshipId: row!.id,
              mentorId: "mentor-6",
              menteeId: "mentee-6",
              actorId: "mentee-6",
            },
          });
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");

      expect(insertedId).toBeDefined();
      const found = await h.store.transaction((tx) => tx.findById(insertedId!));
      expect(found).toBeNull();
      if (h.events) {
        expect(await h.events()).toHaveLength(0);
      }
    });

    it("mentorContext reflects accepting, maxMentees, openSlots and listable; null for a non-mentor", async () => {
      const h = await factory();
      h.seedMentor("mentor-7", {
        accepting: false,
        maxMentees: 4,
        listable: false,
      });
      h.seedUser("mentee-7");
      h.openSlotsTaker("mentor-7", 1);

      const ctx = await h.store.transaction((tx) =>
        tx.mentorContext("mentor-7", "mentee-7")
      );
      expect(ctx).toEqual({
        accepting: false,
        maxMentees: 4,
        openSlots: 1,
        listable: false,
      });

      const none = await h.store.transaction((tx) =>
        tx.mentorContext("no-such-mentor", "mentee-7")
      );
      expect(none).toBeNull();
    });
  });
}
