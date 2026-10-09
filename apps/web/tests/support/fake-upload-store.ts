import type {
  NewUpload,
  UploadRecord,
  UploadScanPayload,
  UploadStore,
  UploadTx,
} from "@/modules/uploads/application/upload-store";

/** A throwing transaction restores the previous state. */
export function createFakeUploadStore(seed: UploadRecord[] = []) {
  let state = {
    uploads: new Map(seed.map((u) => [u.id, { ...u }])),
    scans: [] as UploadScanPayload[],
  };
  let sequence = 0;

  const tx: UploadTx = {
    async find(id) {
      const record = state.uploads.get(id);
      return record ? { ...record } : null;
    },
    async countOpen(ownerId) {
      return [...state.uploads.values()].filter(
        (u) =>
          u.ownerId === ownerId &&
          (u.status === "PENDING_UPLOAD" || u.status === "PENDING_SCAN")
      ).length;
    },
    async create(input: NewUpload) {
      sequence += 1;
      const record: UploadRecord = {
        id: `upload-${sequence}`,
        status: "PENDING_UPLOAD",
        rejectReason: null,
        ...input,
      };
      state.uploads.set(record.id, record);
      return { ...record };
    },
    async markPendingScan(id) {
      const record = state.uploads.get(id);
      if (!record || record.status !== "PENDING_UPLOAD") return false;
      record.status = "PENDING_SCAN";
      return true;
    },
    async enqueueScan(payload) {
      state.scans.push(payload);
    },
  };

  const store: UploadStore = {
    async transaction(work) {
      const before = structuredClone(state);
      try {
        return await work(tx);
      } catch (error) {
        state = before;
        throw error;
      }
    },
  };

  return {
    store,
    get uploads() {
      return state.uploads;
    },
    get scans() {
      return state.scans;
    },
  };
}
