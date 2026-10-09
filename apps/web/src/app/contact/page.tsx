import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/common/legal-page";
import { PublicShell } from "@/components/common/public-shell";
import { legalConfig } from "@/config/legal";
import { getActor } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "How to reach the NIT Arunachal Pradesh alumni office, and where to go for account, content and privacy questions.",
};

/** Contact details come from config/legal.ts. */
export default async function ContactPage() {
  const signedIn = (await getActor()) !== null;
  const office = legalConfig.alumniOffice;
  const lines = [
    {
      term: "Email",
      value: office.email ? (
        <a href={`mailto:${office.email}`}>{office.email}</a>
      ) : null,
    },
    { term: "Phone", value: office.phone },
    { term: "Address", value: office.address },
    { term: "Hours", value: office.hours },
  ].filter((line) => line.value != null);

  return (
    <PublicShell signedIn={signedIn}>
      <LegalPage
        title="Contact"
        intro={
          <p>
            The alumni office at NIT Arunachal Pradesh runs this network. Many
            questions can be answered in the app itself; the sections below say
            where.
          </p>
        }
      >
        <LegalSection id="office" title="Alumni office">
          {lines.length > 0 ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              {lines.map((line) => (
                <div key={line.term} className="contents">
                  <dt className="text-foreground font-medium">{line.term}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>
              The institute will publish the office&rsquo;s contact details
              here.
            </p>
          )}
        </LegalSection>

        <LegalSection id="account" title="Signing in and verification">
          <ul>
            <li>
              Forgot your password?{" "}
              <Link href="/forgot-password">Reset it</Link>.
            </li>
            <li>
              Waiting for verification, or asked to resubmit? Sign in to see
              your request&rsquo;s status and the reviewer&rsquo;s note.
            </li>
            <li>
              Your department, degree or graduation year is wrong? These are set
              by the institute; write to the alumni office.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="content" title="Reporting a post, comment or member">
          <p>
            Use <strong>Report</strong> on the post, comment or message. A
            moderator reviews every report. If someone is in danger, contact the
            police first.
          </p>
        </LegalSection>

        <LegalSection id="privacy" title="Privacy and your data">
          <p>
            You choose who sees your profile in your privacy settings. For a
            copy of your data, a correction or deletion, write to the alumni
            office.
          </p>
        </LegalSection>

        <LegalSection id="security" title="Security problems">
          <p>
            Found a security problem in the network? Write to the alumni office
            with the details, and please do not share them publicly until it is
            fixed.
          </p>
        </LegalSection>
      </LegalPage>
    </PublicShell>
  );
}
