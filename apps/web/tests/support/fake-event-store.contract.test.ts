import { describeEventStoreContract } from "./event-store.contract";
import { createFakeEventStore } from "./fake-event-store";

describeEventStoreContract("fake store", async () =>
  createFakeEventStore().harness()
);
