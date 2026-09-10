"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // The middleware redirects authenticated users landing on "/" to /teacher;
    // anonymous visitors go to the marketing landing page.
    router.replace("/landing");
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center text-muted font-sans">
      Redirecting to Vivran Workspace...
    </div>
  );
}