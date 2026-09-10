"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TeacherSidebar } from "@/app/components/sidebar";

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

  return (
    <div className="relative flex min-h-screen bg-background">
      {/* decorative radial accents like landing */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-36 -top-24 w-96 h-96 rounded-full" style={{ background: 'radial-gradient(circle, rgba(124,110,250,0.12) 0%, transparent 70%)' }} />
        <div className="absolute right-0 bottom-[-60px] w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(79,195,247,0.07) 0%, transparent 70%)' }} />
      </div>

      <TeacherSidebar />
      <main className="flex-1 min-w-0 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto relative z-10">{children}</div>
      </main>
    </div>
  );
}

