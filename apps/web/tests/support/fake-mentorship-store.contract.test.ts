import { describeMentorshipStoreContract } from "./mentorship-store.contract";
import { createFakeMentorshipStore } from "./fake-mentorship-store";

describeMentorshipStoreContract("fake store", async () =>
  createFakeMentorshipStore().harness()
);
