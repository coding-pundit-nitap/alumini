import type { AccountState } from "../../domain/actor";

/**
 * What a person who cannot use the network yet (or any more) is told.
 * Honest and specific, no promised turnaround, and no reason for a suspension or rejection.
 * `VERIFIED` has no status page.
 */
export function accountStatusCopy(
  state: AccountState
): { title: string; body: string } | null {
  switch (state) {
    case "PENDING":
      return {
        title: "Your account is awaiting verification",
        body: "Your email address is confirmed. We still need to verify your connection to NIT Arunachal Pradesh before you can use the network.",
      };
    case "REJECTED":
      return {
        title: "We could not verify your account",
        body: "We were not able to confirm your connection to NIT Arunachal Pradesh. If you think this is a mistake, contact the alumni office.",
      };
    case "SUSPENDED":
      return {
        title: "Your account is suspended",
        body: "You cannot use the network while your account is suspended. If you think this is a mistake, contact the alumni office.",
      };
    case "DEACTIVATED":
      return {
        title: "Your account is deactivated",
        body: "This account has been deactivated. Contact the alumni office if you would like it reactivated.",
      };
    case "VERIFIED":
      return null;
  }
}
