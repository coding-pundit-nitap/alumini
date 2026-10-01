import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { RetentionRow, SettingsStore, SettingsTx } from "./admin-store";
import { createListRetentionSettings } from "./list-retention-settings";
import { createUpdateRetentionSetting } from "./update-retention-setting";

const actor: Actor = {
  userId: "admin-1",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
};
const catalogue = {
  notifications: { defaultDays: 90, minDays: 7, maxDays: 3650, enforced: true },
  audit_logs: {
    defaultDays: 365,
    minDays: 365,
    maxDays: 3650,
    enforced: false,
  },
};
const row = (category: string, retentionDays: number): RetentionRow => ({
  id: `id-${category}`,
  category,
  retentionDays,
  approvedBy: null,
  updatedAt: new Date(0),
  updatedBy: null,
});

function setup(held: Permission[] = [PERMISSIONS.SYSTEM_CONFIGURE]) {
  const tx: SettingsTx = {
    findForUpdate: vi.fn(async (category: string) =>
      category === "notifications"
        ? { id: "id-notifications", retentionDays: 90, approvedBy: null }
        : null
    ),
    update: vi.fn(async () => {}),
    audit: vi.fn(async () => {}),
  };
  const store: SettingsStore = {
    listRetention: vi.fn(async () => [
      row("audit_logs", 365),
      row("notifications", 90),
      row("retired_category", 1),
    ]),
    transaction: vi.fn((fn) => fn(tx)),
  };
  const authorize = vi.fn((a: Actor | null, p: Permission) => {
    if (!a) throw new AuthenticationError();
    if (!held.includes(p)) throw new NotFoundError();
    return a;
  });
  const deps = { store, authorize, catalogue };
  return {
    tx,
    store,
    authorize,
    list: createListRetentionSettings(deps),
    update: createUpdateRetentionSetting(deps),
  };
}

describe("listRetentionSettings", () => {
  it("is concealed from non-holders", async () => {
    const { list, authorize } = setup([]);
    await expect(list({ actor })).rejects.toBeInstanceOf(NotFoundError);
    expect(authorize).toHaveBeenCalledWith(actor, "system.configure", {
      concealed: true,
    });
  });

  it("returns rows in catalogue order with their rules, dropping unknown categories", async () => {
    const { list } = setup();
    const rows = await list({ actor });
    expect(rows.map((r) => [r.category, r.enforced, r.minDays])).toEqual([
      ["notifications", true, 7],
      ["audit_logs", false, 365],
    ]);
  });
});

describe("updateRetentionSetting", () => {
  it("404s an unknown category, including prototype keys, before any read", async () => {
    const { update, store } = setup();
    for (const category of ["nope", "__proto__", "toString"])
      await expect(
        update({ actor, category, input: { retentionDays: 30 } })
      ).rejects.toBeInstanceOf(NotFoundError);
    expect(store.transaction).not.toHaveBeenCalled();
  });

  it("400s a value outside the category's bounds", async () => {
    const { update } = setup();
    await expect(
      update({
        actor,
        category: "notifications",
        input: { retentionDays: 3 },
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("updates and audits config.changed with booleans, never the sign-off text", async () => {
    const { update, tx } = setup();
    const result = await update({
      actor,
      category: "notifications",
      input: { retentionDays: "120", approvedBy: "Registrar" },
    });
    expect(result).toEqual({
      retentionDays: 120,
      approvedBy: "Registrar",
      changed: true,
    });
    expect(tx.update).toHaveBeenCalledWith(
      "id-notifications",
      { retentionDays: 120, approvedBy: "Registrar" },
      "admin-1"
    );
    expect(tx.audit).toHaveBeenCalledWith({
      actorId: "admin-1",
      targetId: "id-notifications",
      metadata: {
        key: "notifications",
        from: { retentionDays: 90, approved: false },
        to: { retentionDays: 120, approved: true },
      },
    });
  });

  it("an unchanged submit writes and audits nothing", async () => {
    const { update, tx } = setup();
    const result = await update({
      actor,
      category: "notifications",
      input: { retentionDays: 90, approvedBy: "" },
    });
    expect(result.changed).toBe(false);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.audit).not.toHaveBeenCalled();
  });
});
