import type { Metadata } from "next";
import { LegalPage } from "@/app/components/legal-page";
import { WAITLIST_EMAIL } from "@/lib/constants";

export const metadata: Metadata = { title: "Privacy policy | Vivran" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="27 September 2026">
      <p>
        Vivran helps teachers turn their own material into course plans, slides, notes and exam papers. This policy
        explains what information we collect to do that, who processes it, how long we keep it, and the choices you
        have. It applies to the Vivran website and web app.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details</strong> — your name and email address, and a sign-in credential managed by our authentication provider (a password, or your Google account if you sign in with Google).</li>
        <li><strong>Teaching preferences</strong> — the subjects, grade levels, language and default difficulty you choose.</li>
        <li><strong>Material you upload</strong> — PDF, Word and PowerPoint files and YouTube links, the text we extract from them (including YouTube transcripts), and search indexes built from that text so generated work can cite it.</li>
        <li><strong>What you create</strong> — the prompts you write and the plans, slides, notes, worksheets, papers, audio and media Vivran generates for you.</li>
        <li><strong>Technical data</strong> — server logs, your IP address (used to limit request rates and prevent abuse) and records of generation requests, including how much AI processing each used.</li>
      </ul>
      <p>
        We do not run advertising or third-party analytics, and we do not sell your information. Your browser stores
        your sign-in session and your theme choice so the app works; nothing else is used to track you.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To provide the service: sign you in, store your material and generate the content you ask for.</li>
        <li>To ground generated content in your own material and show which page each item came from.</li>
        <li>To keep the service secure and working: rate limiting, preventing abuse and fixing faults.</li>
        <li>To reply when you contact us.</li>
      </ul>

      <h2>Who processes it for us</h2>
      <p>We use these providers to run Vivran. Each receives only what it needs for its part of the service.</p>
      <ul>
        <li><strong>Supabase</strong> — sign-in, database and file storage.</li>
        <li><strong>Google (Gemini API)</strong> — generates content and builds search indexes from your material. Your prompts and the relevant parts of your uploads are sent to Google to do this.</li>
        <li><strong>Groq</strong> — a backup text generator, used only when Google&rsquo;s service is temporarily unavailable.</li>
        <li><strong>ElevenLabs and Cartesia</strong> — only when you ask for narration audio, images or video.</li>
        <li><strong>Tally</strong> — only when you choose to export a quiz as a Tally form.</li>
        <li><strong>Render</strong> and our other hosting providers — run the application servers.</li>
      </ul>
      <p>
        <strong>Important:</strong> Vivran currently uses Google&rsquo;s Gemini API on terms under which Google may use
        the content sent to it to improve its products, and that content may be reviewed by people. Please do not
        upload students&rsquo; personal information (names, roll numbers, marks or contact details) or anything you
        are not permitted to share. We will update this policy if these terms change.
      </p>
      <p>Some of these providers process data outside India.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account, material and generated content until you delete them or delete your account. Deleting
        your account (Settings → Delete account) permanently removes your profile, workspace, uploaded files,
        extracted text, generated content and sign-in account. Copies may remain in our providers&rsquo; routine
        backups for a limited period before they are overwritten. Server logs are kept only as long as needed for
        security and troubleshooting.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>View and change your teaching preferences at any time in Settings.</li>
        <li>Delete your account and data yourself in Settings, or ask us to do it.</li>
        <li>Ask us for a copy of your information, to correct it, or to explain how it is used.</li>
      </ul>
      <p>
        We handle these requests in line with India&rsquo;s Digital Personal Data Protection Act, 2023. Write to{" "}
        <a href={`mailto:${WAITLIST_EMAIL}`}>{WAITLIST_EMAIL}</a> and we will respond within 30 days.
      </p>

      <h2>Security</h2>
      <p>
        Uploaded files are kept in access-restricted storage. Every request is checked against your signed-in account,
        so one teacher cannot read another&rsquo;s workspace, and connections are encrypted in transit. No system is
        perfectly secure; if we learn of a breach affecting your information we will tell you without undue delay.
      </p>

      <h2>Who Vivran is for</h2>
      <p>
        Vivran accounts are for teachers and educators aged 18 or over. The service is not directed at children, and
        we do not knowingly collect personal information from anyone under 18.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If we change this policy we will update the date above, and tell you in the app or by email if the change is
        significant. Questions, requests or complaints (including grievances under Indian law) go to{" "}
        <a href={`mailto:${WAITLIST_EMAIL}`}>{WAITLIST_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
