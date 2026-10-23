"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TeacherSidebar } from "@/app/components/sidebar";
import { OnboardingWizard } from "@/app/components/onboarding-wizard";
import { ReferralGate } from "@/app/components/referral-gate";
import { Notices } from "@/app/components/notices";
import { AskVivran } from "@/app/components/ask-vivran";
import { MobileNav } from "@/app/components/mobile-nav";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user || !user.authenticated) {
      router.replace("/login");
    }
  }, [user, router]);

  if (!user || !user.authenticated) {
    return null;
  }

  // Referral gate takes priority over onboarding — checked first so a
  // teacher who signed up via Google (which auto-creates the Supabase
  // account on OAuth callback, bypassing the signup form's referral field
  // entirely) can't reach the wizard or the product without a valid code.
  // Persisted server-side per account (see auth-context.tsx), so it covers
  // every sign-in method uniformly.
  const showReferralGate = !user.referralVerified;

  // First-time-user gate: plain client-side check, same shape as the
  // authentication guard above (no middleware — see middleware.ts's
  // removal). Renders the wizard in place of the page until the teacher's
  // subject/grade/language preferences are saved (PUT /auth/preferences),
  // which flips onboardingCompleted to true on the local user object.
  const showOnboarding = !showReferralGate && !user.onboardingCompleted;
  const showChrome = !showReferralGate && !showOnboarding;

  return (
    <div className="relative flex flex-col lg:flex-row min-h-screen bg-background">
      {/* decorative radial accents like landing */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-36 -top-24 w-96 h-96 rounded-full bg-glow-1" />
        <div className="absolute right-0 bottom-[-60px] w-80 h-80 rounded-full bg-glow-2" />
      </div>

      {showChrome && <TeacherSidebar />}
      {showChrome && <MobileNav />}
      <main className={`flex-1 min-w-0 px-4 py-5 sm:p-6 lg:p-8 overflow-y-auto ${showChrome ? "pb-28 lg:pb-8" : ""}`}>
        <div className="max-w-6xl mx-auto relative z-10">
          {showReferralGate ? <ReferralGate /> : showOnboarding ? <OnboardingWizard /> : children}
        </div>
      </main>
      {showChrome && <Notices />}
      {showChrome && <AskVivran />}
    </div>
  );
}

