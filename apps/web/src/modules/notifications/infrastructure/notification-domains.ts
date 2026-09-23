import { NotificationDomain } from "@nitap/database";

/** The preference domains, straight from the Prisma enum: the one list (N-14). */
export const NOTIFICATION_DOMAINS = Object.values(NotificationDomain);
