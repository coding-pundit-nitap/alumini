import type {
  EducationItem,
  ExperienceItem,
  LinkItem,
  SkillItem,
} from "./profile-items";
import {
  canView,
  effectiveLevel,
  type Viewer,
  type VisibilitySettings,
} from "./visibility";

/** An item as a viewer sees it: never its id. */
type Shown<T extends { id: string }> = Omit<T, "id">;
function shown<T extends { id: string }>(items: T[]): Shown<T>[] {
  return items.map((item) => {
    const { id, ...rest } = item;
    void id;
    return rest;
  });
}

export type ProfileRecord = {
  userId: string;
  fullName: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  department: string | null;
  degree: string | null;
  graduationYear: number | null;
  /** Set once a READY upload is attached; the domain never sees a storage key, only presence. */
  photoUploadId: string | null;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: SkillItem[];
  links: LinkItem[];
  settings: VisibilitySettings;
};

/** What a viewer may see. Hidden sections are omitted keys, never nulls, so a page cannot render "empty" for a hidden field. */
export type ProfileView = {
  userId: string;
  fullName: string;
  headline: string | null;
  /** Always the stable app path `/api/photos/<userId>`, never a raw storage URL: the route
   * re-checks visibility and issues a fresh presigned GET on every read. */
  photoUrl?: string;
  location?: string | null;
  bio?: string | null;
  institution?: {
    department: string | null;
    degree: string | null;
    graduationYear: number | null;
  };
  experience?: Shown<ExperienceItem>[];
  education?: Shown<EducationItem>[];
  skills?: Shown<SkillItem>[];
  links?: Shown<LinkItem>[];
};

/**
 * Null means "not found" for this viewer. Guests and
 * unverified accounts get only the reduced set: name, headline and, if allowed, location.
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
  // The photo follows the core level: the same viewers who see the name see it too.
  if (profile.photoUploadId !== null) {
    view.photoUrl = `/api/photos/${profile.userId}`;
  }
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
    // Section mapping: skills travel with experience, links with contact.
    if (canView(effectiveLevel(settings, "experience"), viewer)) {
      view.experience = shown(profile.experience);
      view.skills = shown(profile.skills);
    }
    if (canView(effectiveLevel(settings, "education"), viewer)) {
      view.education = shown(profile.education);
    }
    if (canView(effectiveLevel(settings, "contact"), viewer)) {
      view.links = shown(profile.links);
    }
  }
  return view;
}
