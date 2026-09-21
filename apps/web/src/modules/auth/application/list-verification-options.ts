import type { Actor } from "../domain/actor";
import { SELF_SERVICE_PERMISSIONS } from "../domain/permission";
import type { Authorization } from "./authorize";
import type { ReferenceOption, VerificationStore } from "./verification-store";

/** The department and degree choices of the evidence form: reference data, for accounts that may submit. */
export function createListVerificationOptions(deps: {
  store: VerificationStore;
  authorize: Authorization["authorize"];
}) {
  return async function listVerificationOptions(args: {
    actor: Actor | null;
  }): Promise<{ departments: ReferenceOption[]; degrees: ReferenceOption[] }> {
    deps.authorize(args.actor, SELF_SERVICE_PERMISSIONS.VERIFICATION_REQUEST);
    return deps.store.listReferenceOptions();
  };
}
