"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem("vivran_user_session");
    if (saved) {
      router.replace("/teacher");
    } else {
      router.replace("/landing");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[#09090E] flex items-center justify-center text-[#8B8B99] font-sans">
      Redirecting to Vivran Workspace...
    </div>
  );
}

