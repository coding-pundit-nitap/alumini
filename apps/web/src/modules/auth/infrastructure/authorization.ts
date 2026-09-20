import { createAuthorization } from "../application/authorize";
import { authzObserver } from "./authz-observer";

/** The process-wide authorizer: real clock, log-and-count observer. */
export const { authorize, can } = createAuthorization({
  observer: authzObserver,
  now: () => new Date(),
});
