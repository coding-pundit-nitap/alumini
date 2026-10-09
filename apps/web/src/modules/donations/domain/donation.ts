import { z } from "zod";

/** Money is integer paise everywhere below the UI. */
export type CampaignStatus = "DRAFT" | "ACTIVE" | "CLOSED";
export type DonationStatus =
  "PLEDGED" | "CONFIRMED" | "NOT_RECEIVED" | "CANCELLED";

export const MIN_PLEDGE_PAISE = 1_000; // ₹10
export const MAX_PLEDGE_PAISE = 100_000_000; // ₹10,00,000
/** A goal up to ₹100 crore; the column itself is a BIGINT. */
export const MAX_GOAL_PAISE = 10_000_000_000;

export const NOT_RECEIVED_REASONS = [
  "NO_PAYMENT_FOUND",
  "AMOUNT_MISMATCH",
  "DUPLICATE",
  "OTHER",
] as const;
export type NotReceivedReason = (typeof NOT_RECEIVED_REASONS)[number];

export type Campaign = {
  id: string;
  title: string;
  description: string;
  purpose: string;
  paymentInstructions: string;
  goalPaise: number | null;
  /** IST calendar dates, `YYYY-MM-DD`. */
  startsOn: string;
  endsOn: string;
  status: CampaignStatus;
  createdAt: Date;
};
export type CampaignProgress = {
  /** CONFIRMED only. */
  raisedPaise: number;
  /** Open pledges, shown separately. */
  pledgedPaise: number;
  donors: number;
};
export type CampaignWithProgress = Campaign & CampaignProgress;

export type Donation = {
  id: string;
  campaignId: string;
  campaignTitle: string;
  donorId: string;
  amountPaise: number;
  paymentReference: string | null;
  status: DonationStatus;
  decidedAt: Date | null;
  note: string | null;
  createdAt: Date;
};
export type DonationWithDonor = Donation & {
  donor: { id: string; name: string; email: string };
};

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
/** Today's IST calendar date, `YYYY-MM-DD` (campaign dates are institute-local). */
export const istToday = (now: Date) =>
  new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Pledges only while ACTIVE and today (IST) is within the campaign's dates. */
export const acceptsPledges = (
  c: Pick<Campaign, "status" | "startsOn" | "endsOn">,
  now: Date
) => {
  const today = istToday(now);
  return c.status === "ACTIVE" && c.startsOn <= today && today <= c.endsOn;
};

/** DRAFT → ACTIVE → CLOSED. */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["CLOSED"],
  CLOSED: [],
};

/** "₹1,234.50" — Indian grouping; paise shown only when present. */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Rupees as typed ("1,500", "1500.5", 1500) → integer paise, or null when it is not an amount. */
export function rupeesToPaise(value: unknown): number | null {
  const text =
    typeof value === "number" ? String(value) : String(value ?? "").trim();
  const clean = text.replaceAll(",", "").replace(/^₹\s*/, "");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

const amount = (min: number, max: number) =>
  z
    .unknown()
    .transform((v, ctx) => {
      const paise = rupeesToPaise(v);
      if (paise === null) {
        ctx.addIssue({ code: "custom", message: "Enter an amount in rupees." });
        return z.NEVER;
      }
      return paise;
    })
    .pipe(
      z
        .number()
        .min(min, `At least ${formatPaise(min)}.`)
        .max(max, `At most ${formatPaise(max)}.`)
    );

/** UTR / cheque number: letters, digits, `/` and `-`, upper-cased so a match ignores case. */
export const paymentReference = z
  .string()
  .trim()
  .transform((v) => v.replaceAll(/\s+/g, "").toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z0-9/-]{4,64}$/,
        "Use the 4–64 letter and digit reference from your bank or cheque."
      )
  );
const optionalReference = z
  .union([z.literal(""), z.null(), paymentReference])
  .optional()
  .transform((v) => (v ? v : null));

const date = z.iso.date("Use a date like 2026-10-01.");

export const campaignInputSchema = z
  .object({
    title: z.string().trim().min(3, "At least 3 characters.").max(150),
    description: z.string().trim().min(10, "At least 10 characters.").max(5000),
    purpose: z.string().trim().min(1, "Say what the money is for.").max(200),
    paymentInstructions: z
      .string()
      .trim()
      .min(10, "Say how to pay: bank account, UPI ID or cheque address.")
      .max(2000),
    goal: z
      .union([z.literal(""), z.null(), amount(100, MAX_GOAL_PAISE)])
      .optional()
      .transform((v) => (typeof v === "number" ? v : null)),
    startsOn: date,
    endsOn: date,
  })
  .strict()
  .refine((v) => v.endsOn >= v.startsOn, {
    message: "The end date can't be before the start date.",
    path: ["endsOn"],
  });
export type CampaignInput = z.infer<typeof campaignInputSchema>;

export const pledgeInputSchema = z
  .object({
    amount: amount(MIN_PLEDGE_PAISE, MAX_PLEDGE_PAISE),
    paymentReference: optionalReference,
  })
  .strict();
export type PledgeInput = z.infer<typeof pledgeInputSchema>;

export const referenceInputSchema = z
  .object({ paymentReference: paymentReference })
  .strict();

export const confirmInputSchema = z
  .object({ paymentReference: optionalReference })
  .strict();

export const notReceivedInputSchema = z
  .object({ reason: z.enum(NOT_RECEIVED_REASONS) })
  .strict();

export const DONATION_STATUSES: readonly DonationStatus[] = [
  "PLEDGED",
  "CONFIRMED",
  "NOT_RECEIVED",
  "CANCELLED",
];
