/** Public API of the auth module. Other code imports from here, never from the module's internals. */
export { auth } from "./infrastructure/auth";
export { getActor } from "./infrastructure/actor";
export { authorize, can } from "./infrastructure/authorization";
export { PERMISSIONS } from "./domain/permission";
export type { Permission } from "./domain/permission";
export type { AccountState, Actor, Resource } from "./domain/actor";
export { assertEmailPolicyValid } from "./infrastructure/email-policy-config";
export { AuthCard } from "./presentation/ui/auth-card";
export { RegisterForm } from "./presentation/ui/register-form";
export { ResendVerification } from "./presentation/ui/resend-verification";
export { LoginForm } from "./presentation/ui/login-form";
export { ForgotPasswordForm } from "./presentation/ui/forgot-password-form";
export { ResetPasswordForm } from "./presentation/ui/reset-password-form";
