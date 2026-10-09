import type { Tick } from "@/lib/role-tick";
import type { ListCursor } from "../domain/cursor";
import type { MentorProfileInput } from "../domain/mentor-profile";

export type MentorProfileRecord = MentorProfileInput & { userId: string };

/**
 * A mentor as a student sees them: profile fields the viewer may already see,
 * plus the mentor's own offer.
 */
export type MentorCard = {
  userId: string;
  fullName: string;
  headline: string | null;
  department: string | null;
  currentCompany: string | null;
  hasPhoto: boolean;
  /** Set by composition after the read. */
  tick?: Tick | null;
  expertise: string;
  topics: string[];
  availability: string;
  preferredContactMethod: MentorProfileInput["preferredContactMethod"];
  /** `max_mentees` minus open (ACCEPTED/ACTIVE) mentorships, floored at 0. */
  spotsLeft: number;
  /** Lower-cased name: the keyset cursor's sort key. Never sent to clients. */
  sortKey: string;
};

export type MentorFilter = {
  topic?: string;
  department?: string;
  company?: string;
  /** Only mentors with an open slot. Defaults to true (application layer). */
  hasSpots?: boolean;
  limit: number;
  after?: ListCursor;
};

export type MentorQueries = {
  /** Active, visible mentors for this viewer, by name then id. */
  list(viewerId: string, filter: MentorFilter): Promise<MentorCard[]>;
  findProfile(userId: string): Promise<MentorProfileRecord | null>;
};

export type MentorProfileStore = {
  upsert(
    userId: string,
    input: MentorProfileInput
  ): Promise<MentorProfileRecord>;
};
