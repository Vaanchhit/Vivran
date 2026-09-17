import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

/** In-app "coming soon" / empty-state panel — for authenticated pages that
 * already have sidebar chrome, unlike the marketing site's ComingSoon. */
export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="p-10 rounded-2xl bg-surface border border-border text-center max-w-xl mx-auto">
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#7C6EFA]/10 border border-[#7C6EFA]/20 flex items-center justify-center text-[#7C6EFA]">
        <Icon className="w-6 h-6" />
      </div>
      <div className="font-bold text-foreground text-base mb-2">{title}</div>
      <p className="text-sm text-muted leading-relaxed mb-6">{description}</p>
      <Link href="/teacher" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4FC3F7] hover:underline">
        Back to Dashboard <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
