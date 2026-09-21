import {
  canView,
  effectiveLevel,
  type Viewer,
  type VisibilitySettings,
} from "./visibility";

export type ProfileRecord = {
  userId: string;
  fullName: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  department: string | null;
  degree: string | null;
  graduationYear: number | null;
  settings: VisibilitySettings;
};

/** What a viewer may see. Hidden sections are omitted keys, never nulls, so a page cannot render "empty" for a hidden field. */
export type ProfileView = {
  userId: string;
  fullName: string;
  headline: string | null;
  location?: string | null;
  bio?: string | null;
  institution?: {
    department: string | null;
    degree: string | null;
    graduationYear: number | null;
  };
};

/**
 * Null means "not found" for this viewer (RBAC §6 rule 6: existence is not leaked). Guests and
 * unverified accounts get only the reduced set (FR-DIR-004): name, headline and, if allowed, location.
 */
export function projectProfile(
  profile: ProfileRecord,
  viewer: Viewer
): ProfileView | null {
  const { settings } = profile;
  if (!canView(effectiveLevel(settings, "core"), viewer)) return null;

  const view: ProfileView = {
    userId: profile.userId,
    fullName: profile.fullName,
    headline: profile.headline,
  };
  if (canView(effectiveLevel(settings, "location"), viewer)) {
    view.location = profile.location;
  }
  const reduced = viewer === "guest" || viewer === "unverified";
  if (!reduced) {
    view.bio = profile.bio;
    view.institution = {
      department: profile.department,
      degree: profile.degree,
      graduationYear: profile.graduationYear,
    };
  }
  return view;
}
