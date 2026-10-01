import type {
  CampaignStatus,
  DonationStatus,
  NotReceivedReason,
} from "../domain/donation";

export const DONATION_STATUS_LABEL: Record<DonationStatus, string> = {
  PLEDGED: "Awaiting confirmation",
  CONFIRMED: "Received",
  NOT_RECEIVED: "Not received",
  CANCELLED: "Cancelled",
};
export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  CLOSED: "Closed",
};
export const NOT_RECEIVED_LABEL: Record<NotReceivedReason | "expired", string> =
  {
    NO_PAYMENT_FOUND: "No matching payment found",
    AMOUNT_MISMATCH: "Amount did not match",
    DUPLICATE: "Duplicate pledge",
    OTHER: "Other",
    expired: "No reference given within 30 days",
  };

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "UTC",
});
/** A `YYYY-MM-DD` calendar date, as written (no timezone shift). */
export const formatDay = (day: string) =>
  dateFormat.format(new Date(`${day}T00:00:00Z`));
