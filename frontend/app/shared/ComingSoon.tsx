import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function ComingSoon({ role }: { role: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-[#7C6EFA]/10 border border-[#7C6EFA]/20 flex items-center justify-center text-[#7C6EFA]">
          <Sparkles className="w-6 h-6" />
        </div>
        <h1 className="text-3xl font-extrabold font-display tracking-tight text-foreground mb-3">{role} — Coming Soon</h1>
        <p className="text-muted mb-6 leading-relaxed">
          The {role.toLowerCase()} space is next on the roadmap, built on the same syllabus-aware engine already live for teachers.
        </p>
        <Link href="/login" className="grad-btn inline-flex px-5 py-2.5 rounded-xl text-white text-sm font-semibold">
          Enter Teacher Workspace
        </Link>
      </div>
    </div>
  );
}
