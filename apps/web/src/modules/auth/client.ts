/**
 * Client-safe entry point of the auth module. A client component that imported `./index.ts` would drag
 * Better Auth's server instance and the Prisma client into the browser bundle (see
 * modules/moderation/index.ts), so browser code imports the auth client from here instead.
 */
export { authClient } from "./presentation/auth-client";
