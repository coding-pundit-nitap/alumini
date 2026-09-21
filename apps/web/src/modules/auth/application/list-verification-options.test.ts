import { describe, expect, it } from "vitest";

import { createFakeVerificationStore } from "../../../../tests/support/fake-verification-store";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { AccountState, Actor } from "../domain/actor";
import { createAuthorization } from "./authorize";
import { createListVerificationOptions } from "./list-verification-options";

const { authorize } = createAuthorization({
  observer: { record() {} },
  now: () => new Date(),
});
const actorOf = (accountState: AccountState): Actor => ({
  userId: "u1",
  accountState,
  requestId: "r",
  grants: [],
});

const list = () =>
  createListVerificationOptions({
    store: createFakeVerificationStore({ accounts: [] }).store,
    authorize,
  });

describe("listVerificationOptions", () => {
  it.each(["PENDING", "REJECTED"] as const)(
    "gives a %s account the department and degree lists",
    async (state) => {
      const options = await list()({ actor: actorOf(state) });
      expect(options.departments.length).toBeGreaterThan(0);
      expect(options.degrees.length).toBeGreaterThan(0);
    }
  );

  it("refuses the unauthenticated and accounts that cannot submit", async () => {
    await expect(list()({ actor: null })).rejects.toBeInstanceOf(
      AuthenticationError
    );
    await expect(list()({ actor: actorOf("VERIFIED") })).rejects.toBeInstanceOf(
      AuthorizationError
    );
  });
});
