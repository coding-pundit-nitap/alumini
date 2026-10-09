import type { ProfileRecord } from "../domain/profile";
import type { ProfileCoreInput } from "../domain/profile-input";
import type { VisibilitySettings } from "../domain/visibility";

export interface ProfileStore {
  find(userId: string): Promise<ProfileRecord | null>;
  /** False when the user has no profile row. Institutional fields are not part of this port on purpose. */
  updateCore(userId: string, core: ProfileCoreInput): Promise<boolean>;
  updatePrivacy(userId: string, settings: VisibilitySettings): Promise<boolean>;
  /** Narrow on purpose: only ever sets this one column, never touches name/headline/bio/location. */
  setPhoto(userId: string, photoUploadId: string | null): Promise<boolean>;
  /** The attached photo's storage key; null if none or the upload is not READY. */
  findPhotoKey(userId: string): Promise<string | null>;
}
