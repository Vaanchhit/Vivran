"use client";

// /beta signs in like the rest of the product: the same account, the same beta
// gate and onboarding, then the chat on the real backend.
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { OnboardingWizard } from "@/app/components/onboarding-wizard";
import { ReferralGate } from "@/app/components/referral-gate";

function Gate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!user?.authenticated) router.replace("/login?next=/beta"); }, [user, router]);
  if (!user?.authenticated) return null;
  if (!user.referralVerified || !user.onboardingCompleted) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="max-w-3xl mx-auto">{!user.referralVerified ? <ReferralGate /> : <OnboardingWizard />}</div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function BetaLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider><Gate>{children}</Gate></AuthProvider>;
}
