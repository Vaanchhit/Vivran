export default function ComingSoon({ role }: { role: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-semibold mb-4">{role} — Coming Soon</h1>
        <p className="text-[#BDBDD0] mb-6">We're building this experience. Sign up for updates or check back later.</p>
        <div className="flex items-center justify-center gap-3">
          <a
            href="/login"
            className="px-4 py-2 bg-[#111827] hover:bg-[#0b0b0f] border border-neutral-700 rounded"
          >
            Login
          </a>
        </div>
      </div>
    </div>
  );
}
