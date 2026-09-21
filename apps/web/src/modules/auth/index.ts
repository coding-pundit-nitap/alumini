/** Public API of the auth module. Other code imports from here, never from the module's internals. */
export { auth } from "./infrastructure/auth";
export { getActor } from "./infrastructure/actor";
export { authorize, can } from "./infrastructure/authorization";
export { PERMISSIONS } from "./domain/permission";
export type { Permission } from "./domain/permission";
export type { AccountState, Actor, Resource } from "./domain/actor";
export { assertEmailPolicyValid } from "./infrastructure/email-policy-config";
