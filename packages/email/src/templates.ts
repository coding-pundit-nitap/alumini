export type EmailTemplate =
  | {
      template: "verify-email";
      params: { verificationUrl: string; expiresInMinutes: number };
    }
  | {
      template: "reset-password";
      params: { resetUrl: string; expiresInMinutes: number };
    }
  | { template: "existing-account"; params: Record<string, never> };

const SIGNATURE = "NIT Arunachal Pradesh Alumni Network";

/** Pure: the same input always renders the same message. Plain text only for now. */
export function renderEmail(input: EmailTemplate): {
  subject: string;
  text: string;
} {
  switch (input.template) {
    case "verify-email":
      return {
        subject: "Verify your email for the NITAP Alumni Network",
        text: `Hello,\n\nConfirm your email address by opening this link (valid for ${input.params.expiresInMinutes} minutes):\n\n${input.params.verificationUrl}\n\nIf you did not create an account, you can ignore this message.\n\n${SIGNATURE}`,
      };
    case "reset-password":
      return {
        subject: "Reset your NITAP Alumni Network password",
        text: `Hello,\n\nReset your password by opening this link (valid for ${input.params.expiresInMinutes} minutes):\n\n${input.params.resetUrl}\n\nIf you did not request this, you can ignore this message; your password stays unchanged.\n\n${SIGNATURE}`,
      };
    case "existing-account":
      return {
        subject: "Someone tried to register with your email",
        text: `Hello,\n\nAn account with this email address already exists. If this was you, sign in or reset your password.\n\nIf it was not you, no action is needed.\n\n${SIGNATURE}`,
      };
  }
}
