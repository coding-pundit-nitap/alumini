import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/common/legal-page";
import { PublicShell } from "@/components/common/public-shell";
import { getActor } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "The rules for using the NIT Arunachal Pradesh Alumni Network: who may join, how to behave, and what happens to what you post.",
};

/** UI/UX §3.2 supporting page. Draft copy until the institute approves it (config/legal.ts, OW-7). */
export default async function TermsPage() {
  const signedIn = (await getActor()) !== null;
  return (
    <PublicShell signedIn={signedIn}>
      <LegalPage
        title="Terms of use"
        intro={
          <p>
            The NIT Arunachal Pradesh Alumni Network is run by NIT Arunachal
            Pradesh for its alumni, students and staff. By creating an account
            you agree to these terms.
          </p>
        }
      >
        <LegalSection id="joining" title="Who can join">
          <p>
            Anyone may register, but only members the institute has verified can
            use the network. Verification checks that you studied or work at NIT
            Arunachal Pradesh. The institute may refuse or withdraw verification
            if the details you gave are not accurate.
          </p>
        </LegalSection>

        <LegalSection id="account" title="Your account">
          <ul>
            <li>One account per person, in your own name.</li>
            <li>
              Keep your password to yourself. You are responsible for what is
              done with your account.
            </li>
            <li>
              Keep your profile accurate. Institutional details (department,
              degree, graduation year) are set by the institute; ask the alumni
              office to correct them.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="conduct" title="How to behave">
          <p>Treat other members with respect. Do not:</p>
          <ul>
            <li>harass, threaten or impersonate anyone;</li>
            <li>
              post anything unlawful, hateful, sexually explicit or misleading;
            </li>
            <li>
              send spam, chain messages or unsolicited advertising, or collect
              members&rsquo; details for marketing;
            </li>
            <li>
              upload malware or try to get around the network&rsquo;s security,
              rate limits or privacy settings.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="content" title="What you post">
          <p>
            You keep ownership of your posts, comments, messages and images. You
            allow the network to store them and show them to the members they
            are meant for. You can edit or delete your own posts and comments at
            any time.
          </p>
          <p>
            Any member can report content. Moderators may remove content that
            breaks these terms. A post that has been reported cannot be edited
            until a moderator has reviewed it. Uploaded files are scanned for
            malware before anyone can see them.
          </p>
        </LegalSection>

        <LegalSection id="privacy" title="Your privacy">
          <p>
            You choose who sees each part of your profile. Your email address,
            phone number and roll number are never shown to other members. See{" "}
            <Link href="/#privacy">how we protect your privacy</Link>.
          </p>
        </LegalSection>

        <LegalSection
          id="opportunities"
          title="Jobs, mentorship, events and donations"
        >
          <p>
            Members post jobs, offer mentorship and organise events. The
            institute does not check every listing and is not a party to any
            arrangement between members. Use your own judgement, and report
            anything suspicious.
          </p>
          <p>
            Donations are paid directly to the institute through the details on
            each campaign. The network records your pledge; it does not take
            payments.
          </p>
        </LegalSection>

        <LegalSection id="enforcement" title="Suspension">
          <p>
            If you break these terms, the institute may remove your content or
            suspend your account. A suspended member can still sign in to see
            why and how to appeal.
          </p>
        </LegalSection>

        <LegalSection id="changes" title="Changes to these terms">
          <p>
            We will update the date at the top of this page when these terms
            change, and tell members about significant changes in the app.
            Questions? <Link href="/contact">Contact us</Link>.
          </p>
        </LegalSection>
      </LegalPage>
    </PublicShell>
  );
}
