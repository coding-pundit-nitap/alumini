/** Public API of the auth module. Other code imports from here, never from the module's internals. */
export { auth } from "./infrastructure/auth";
export { getActor } from "./infrastructure/actor";
export { authorize, can } from "./infrastructure/authorization";
export { PERMISSIONS, SELF_SERVICE_PERMISSIONS } from "./domain/permission";
export type { Permission } from "./domain/permission";
export type { AccountState, Actor, Resource } from "./domain/actor";
export { assertEmailPolicyValid } from "./infrastructure/email-policy-config";
export { AuthCard } from "./presentation/ui/auth-card";
export { RegisterForm } from "./presentation/ui/register-form";
export { ResendVerification } from "./presentation/ui/resend-verification";
export { LoginForm } from "./presentation/ui/login-form";
export { ForgotPasswordForm } from "./presentation/ui/forgot-password-form";
export { ResetPasswordForm } from "./presentation/ui/reset-password-form";
export { accountStatusCopy } from "./presentation/ui/account-status-copy";
export { SignOutButton } from "./presentation/ui/sign-out-button";
export {
  decideVerificationRequest,
  getOwnVerification,
  listPendingVerificationRequests,
  listVerificationOptions,
  submitVerificationRequest,
} from "./infrastructure/composition";
export type { OwnVerification } from "./application/get-own-verification";
export type { PendingPage } from "./application/list-pending-verification-requests";
export type { PendingVerification } from "./application/verification-store";
export type {
  VerificationDecision,
  VerificationTrack,
} from "./domain/verification-request";
export { OnboardingPanel } from "./presentation/ui/onboarding-panel";
export { EvidenceForm } from "./presentation/ui/evidence-form";
export type { ReferenceOption } from "./application/verification-store";
// Server Actions in app/ read forms through these (app/ may reach a module only through its index).
export {
  parseDecisionForm,
  parseEvidenceForm,
} from "./presentation/api/verification-forms";
export { DecisionForm } from "./presentation/ui/decision-form";
export { ReviewQueue } from "./presentation/ui/review-queue";
