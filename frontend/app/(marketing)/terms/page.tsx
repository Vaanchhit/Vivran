import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/app/components/legal-page";
import { WAITLIST_EMAIL } from "@/lib/constants";

export const metadata: Metadata = { title: "Terms & conditions | Vivran" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms & conditions" updated="3 October 2026">
      <p>
        These terms govern your use of Vivran. By creating an account or using the service you agree to them. If you
        do not agree, please do not use Vivran.
      </p>

      <h2>The service is in beta</h2>
      <p>
        Vivran is an early, invite-only product offered free of charge. Features may change, pause or be removed, and
        the service may occasionally be unavailable. We do not guarantee any particular level of availability during
        the beta.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or over and use Vivran for teaching or education-related work.</li>
        <li>Access currently requires a referral code. Codes are personal to you; please do not share them publicly.</li>
        <li>Keep your sign-in details secure. You are responsible for activity on your account.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You keep ownership of the material you upload and the content Vivran generates for you. You give us permission
        to store, process and transmit that material only as needed to provide the service to you, including sending it
        to the providers listed in our <Link href="/privacy">privacy policy</Link>.
      </p>
      <p>
        You confirm that you have the right to upload the material you provide — for example, that it is your own work,
        your institution&rsquo;s material you are allowed to use, or otherwise permitted — and that it does not include
        other people&rsquo;s personal information without a lawful basis.
      </p>

      <h2>Student work and student information</h2>
      <p>
        Vivran is built from what teachers prepare, not from what students submit. When you upload teaching material,
        including past lesson plans, slides, worksheets, question papers and answer keys you have used before:
      </p>
      <ul>
        <li>
          <strong>Do not upload work submitted by students</strong>, such as answer scripts, marked worksheets,
          assignments or projects. Vivran may decline files that appear to be student-submitted work.
        </li>
        <li>
          Remove students&rsquo; names, roll numbers, marks and other details that identify a student before you
          upload. Vivran may remove students&rsquo; names it detects in an upload before the material is processed
          or stored.
        </li>
        <li>
          Blank question papers, answer keys and marking schemes that you or your institution wrote are fine to upload.
        </li>
      </ul>
      <p>
        These checks are a safeguard, not a guarantee. By uploading, you confirm that the material contains no
        student&rsquo;s personal information, or that you have a lawful basis to share it. You agree to indemnify
        Vivran against claims, losses and costs arising from material you upload in breach of this section.
      </p>

      <h2>AI-generated content</h2>
      <p>
        Vivran uses AI models to produce plans, slides, notes, questions and answers. AI output can be incomplete,
        inaccurate or unsuitable for your students, even when it cites your material. <strong>You are responsible for
        reviewing everything before you teach from it, share it or use it for assessment.</strong> Vivran is a drafting
        tool, not a substitute for your professional judgement.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>upload material that is unlawful, infringes someone else&rsquo;s rights, or contains malware;</li>
        <li>use Vivran to harass, deceive or harm anyone, or to produce content that does;</li>
        <li>try to access other users&rsquo; data, get around rate limits or the referral gate, or disrupt the service;</li>
        <li>scrape, resell or build a competing product from the service.</li>
      </ul>

      <h2>Third-party services</h2>
      <p>
        Some features rely on other companies&rsquo; services (for example Google, ElevenLabs, Cartesia and Tally).
        Their availability is outside our control, and exporting to a third-party service such as Tally is also
        subject to that service&rsquo;s own terms.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can stop using Vivran and delete your account at any time from Settings. We may suspend or close accounts
        that break these terms or put the service or other users at risk, and we may end the beta. Where reasonable we
        will give notice so you can keep a copy of your work.
      </p>

      <h2>Liability</h2>
      <p>
        The service is provided &ldquo;as is&rdquo;. To the extent the law allows, we are not liable for indirect or
        consequential losses, or for losses arising from relying on generated content without reviewing it. Nothing in
        these terms limits liability that cannot be limited by law.
      </p>

      <h2>Law and changes</h2>
      <p>
        These terms are governed by the laws of India, and the courts of New Delhi have jurisdiction. We may update
        these terms; if a change is significant we will tell you in the app or by email before it takes effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${WAITLIST_EMAIL}`}>{WAITLIST_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
