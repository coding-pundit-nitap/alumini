import type { ProfileStore } from "@/modules/users/application/profile-store";
import type { ProfileRecord } from "@/modules/users/domain/profile";

/** In-memory ProfileStore for unit tests. */
export function createFakeProfileStore(initial: ProfileRecord[]) {
  const records = new Map(initial.map((r) => [r.userId, structuredClone(r)]));
  const store: ProfileStore = {
    async find(userId) {
      const record = records.get(userId);
      return record ? structuredClone(record) : null;
    },
    async updateCore(userId, core) {
      const record = records.get(userId);
      if (!record) return false;
      Object.assign(record, core);
      return true;
    },
    async updatePrivacy(userId, settings) {
      const record = records.get(userId);
      if (!record) return false;
      record.settings = { ...settings };
      return true;
    },
  };
  return { store, records };
}
