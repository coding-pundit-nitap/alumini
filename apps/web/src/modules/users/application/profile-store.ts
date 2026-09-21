import type { ProfileRecord } from "../domain/profile";
import type { ProfileCoreInput } from "../domain/profile-input";
import type { VisibilitySettings } from "../domain/visibility";

export interface ProfileStore {
  find(userId: string): Promise<ProfileRecord | null>;
  /** False when the user has no profile row. Institutional fields are not part of this port on purpose. */
  updateCore(userId: string, core: ProfileCoreInput): Promise<boolean>;
  updatePrivacy(userId: string, settings: VisibilitySettings): Promise<boolean>;
}
