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
    <div className="flex min-h-screen bg-[#09090E]">
      <TeacherSidebar />
      <main className="flex-1 min-w-0 p-8 overflow-y-auto">{children}</main>
    </div>
  );
}

