import Link from "next/link";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="max-w-3xl mx-auto px-6 py-14">
      <h1 className="text-3xl font-extrabold font-display text-foreground">{title}</h1>
      <p className="text-xs text-muted mt-2">Last updated {updated}</p>
      <div className="legal mt-8 space-y-4 text-sm leading-relaxed text-muted [&_h2]:text-foreground [&_h2]:font-semibold [&_h2]:text-base [&_h2]:mt-9 [&_h2]:mb-1 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-accent [&_a]:underline">
        {children}
      </div>
      <div className="mt-12 pt-6 border-t border-border text-xs text-muted flex gap-5">
        <Link href="/privacy" className="hover:text-foreground">Privacy policy</Link>
        <Link href="/terms" className="hover:text-foreground">Terms &amp; conditions</Link>
      </div>
    </article>
  );
}
