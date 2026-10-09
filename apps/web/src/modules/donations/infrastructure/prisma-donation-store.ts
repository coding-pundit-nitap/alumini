import { Prisma, type PrismaClient } from "@nitap/database";
import type { AuditWriter } from "@nitap/database/audit";
import type { OutboxWriter } from "@nitap/database/outbox";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";
import { ConflictError } from "@/lib/errors";

import type {
  DonationQueries,
  DonationStore,
  DonationTx,
} from "../application/donation-store";
import type {
  Campaign,
  CampaignInput,
  CampaignStatus,
  CampaignWithProgress,
  DonationStatus,
} from "../domain/donation";

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const fromDate = (d: Date) => d.toISOString().slice(0, 10);

type CampaignRecord = {
  id: string;
  title: string;
  description: string;
  purpose: string;
  paymentInstructions: string;
  goalPaise: bigint | null;
  startsOn: Date;
  endsOn: Date;
  status: CampaignStatus;
  createdAt: Date;
};
const toCampaign = (r: CampaignRecord): Campaign => ({
  id: r.id,
  title: r.title,
  description: r.description,
  purpose: r.purpose,
  paymentInstructions: r.paymentInstructions,
  goalPaise: r.goalPaise === null ? null : Number(r.goalPaise),
  startsOn: fromDate(r.startsOn),
  endsOn: fromDate(r.endsOn),
  status: r.status,
  createdAt: r.createdAt,
});
const campaignData = (input: CampaignInput) => ({
  title: input.title,
  description: input.description,
  purpose: input.purpose,
  paymentInstructions: input.paymentInstructions,
  goalPaise: input.goal === null ? null : BigInt(input.goal),
  startsOn: toDate(input.startsOn),
  endsOn: toDate(input.endsOn),
});

/** The per-campaign unique reference is the guard, not a "seen before" read. */
const isReferenceTaken = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";
async function guardReference<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (isReferenceTaken(error))
      throw new ConflictError("PAYMENT_REFERENCE_TAKEN", { cause: error });
    throw error;
  }
}

type LockedCampaignRow = {
  id: string;
  title: string;
  description: string;
  purpose: string;
  payment_instructions: string;
  goal_paise: bigint | null;
  starts_on: Date;
  ends_on: Date;
  status: CampaignStatus;
  created_at: Date;
};
const fromLocked = (r: LockedCampaignRow): Campaign =>
  toCampaign({
    id: r.id,
    title: r.title,
    description: r.description,
    purpose: r.purpose,
    paymentInstructions: r.payment_instructions,
    goalPaise: r.goal_paise,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    status: r.status,
    createdAt: r.created_at,
  });

/**
 * Rows, audit entries and outbox events share the transaction. Lock order:
 * campaign, then donation.
 */
export function createPrismaDonationStore(deps: {
  runner: Pick<TransactionRunner, "run">;
  audit: AuditWriter;
  outbox: OutboxWriter;
}): DonationStore {
  const forClient = (db: Prisma.TransactionClient): DonationTx => {
    const lockCampaign = async (id: string, mode: "SHARE" | "UPDATE") => {
      const rows = await db.$queryRaw<LockedCampaignRow[]>`
        SELECT id, title, description, purpose, payment_instructions, goal_paise,
               starts_on, ends_on, status, created_at
          FROM donation_campaign WHERE id = ${id}::uuid
         ${mode === "SHARE" ? Prisma.sql`FOR SHARE` : Prisma.sql`FOR UPDATE`}`;
      return rows[0] ? fromLocked(rows[0]) : null;
    };
    return {
      findCampaign: (id) => lockCampaign(id, "SHARE"),
      findCampaignForUpdate: (id) => lockCampaign(id, "UPDATE"),

      async insertCampaign(input, createdBy) {
        const row = await db.donationCampaign.create({
          data: { ...campaignData(input), createdBy },
          select: { id: true },
        });
        return row.id;
      },

      async updateCampaign(id, input) {
        await db.donationCampaign.update({
          where: { id },
          data: campaignData(input),
        });
      },

      async setCampaignStatus(id, to) {
        await db.donationCampaign.update({
          where: { id },
          data: { status: to },
        });
      },

      async insertDonation(input) {
        const row = await guardReference(
          db.donation.create({
            data: { ...input, amountPaise: BigInt(input.amountPaise) },
            select: { id: true },
          })
        );
        return row.id;
      },

      async findDonationForUpdate(id) {
        const rows = await db.$queryRaw<
          {
            id: string;
            campaign_id: string;
            donor_id: string;
            status: DonationStatus;
            payment_reference: string | null;
          }[]
        >`
          SELECT id, campaign_id, donor_id, status, payment_reference
            FROM donation WHERE id = ${id}::uuid FOR UPDATE`;
        const r = rows[0];
        return r
          ? {
              id: r.id,
              campaignId: r.campaign_id,
              donorId: r.donor_id,
              status: r.status,
              paymentReference: r.payment_reference,
            }
          : null;
      },

      async updateDonation(id, patch) {
        await guardReference(
          db.donation.update({ where: { id }, data: patch })
        );
      },

      async audit(entry) {
        await deps.audit.record(db, entry);
      },

      async enqueue(event) {
        await deps.outbox.add(db, event);
      },
    };
  };

  return {
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}

type ProgressRow = {
  campaign_id: string;
  raised: bigint | null;
  pledged: bigint | null;
  donors: number;
};

/**
 * Reads for the member and admin pages. Progress counts CONFIRMED only; open
 * pledges separately.
 */
export function createPrismaDonationQueries(db: PrismaClient): DonationQueries {
  const progressOf = async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, ProgressRow>();
    const rows = await db.$queryRaw<ProgressRow[]>`
      SELECT campaign_id,
             sum(amount_paise) FILTER (WHERE status = 'CONFIRMED') AS raised,
             sum(amount_paise) FILTER (WHERE status = 'PLEDGED') AS pledged,
             count(DISTINCT donor_id) FILTER (WHERE status = 'CONFIRMED')::int AS donors
        FROM donation
       WHERE campaign_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
       GROUP BY campaign_id`;
    return new Map(rows.map((r) => [r.campaign_id, r]));
  };
  const withProgress = async (
    campaigns: CampaignRecord[]
  ): Promise<CampaignWithProgress[]> => {
    const progress = await progressOf(campaigns.map((c) => c.id));
    return campaigns.map((c) => {
      const p = progress.get(c.id);
      return {
        ...toCampaign(c),
        raisedPaise: Number(p?.raised ?? 0),
        pledgedPaise: Number(p?.pledged ?? 0),
        donors: p?.donors ?? 0,
      };
    });
  };
  const toDonation = (r: {
    id: string;
    campaignId: string;
    campaign: { title: string };
    donorId: string;
    amountPaise: bigint;
    paymentReference: string | null;
    status: DonationStatus;
    decidedAt: Date | null;
    note: string | null;
    createdAt: Date;
  }) => ({
    id: r.id,
    campaignId: r.campaignId,
    campaignTitle: r.campaign.title,
    donorId: r.donorId,
    amountPaise: Number(r.amountPaise),
    paymentReference: r.paymentReference,
    status: r.status,
    decidedAt: r.decidedAt,
    note: r.note,
    createdAt: r.createdAt,
  });

  return {
    async listCampaigns(statuses) {
      const rows = await db.donationCampaign.findMany({
        where: { status: { in: [...statuses] } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      const sorted = [
        ...rows
          .filter((r) => r.status === "ACTIVE")
          .sort((a, b) => a.endsOn.getTime() - b.endsOn.getTime()),
        ...rows.filter((r) => r.status !== "ACTIVE"),
      ];
      return withProgress(sorted);
    },

    async getCampaign(id) {
      const row = await db.donationCampaign.findUnique({ where: { id } });
      return row ? ((await withProgress([row]))[0] ?? null) : null;
    },

    async listByDonor(donorId, take) {
      const rows = await db.donation.findMany({
        where: { donorId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        include: { campaign: { select: { title: true } } },
      });
      return rows.map(toDonation);
    },

    async listDonations({ status, campaignId, take }) {
      const rows = await db.donation.findMany({
        where: { status, campaignId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        include: {
          campaign: { select: { title: true } },
          donor: { select: { id: true, name: true, email: true } },
        },
      });
      return rows.map((r) => ({ ...toDonation(r), donor: r.donor }));
    },
  };
}
