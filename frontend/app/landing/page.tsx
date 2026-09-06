import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-3xl text-center">
        <h1 className="text-5xl font-bold mb-4">Vivran</h1>
        <p className="text-[#CFCFE0] mb-8">AI-powered workspace for teachers to create, plan, and assess learning materials.</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/teacher" className="px-5 py-3 bg-white text-black rounded font-medium">Teacher Workspace</Link>
          <Link href="/student" className="px-5 py-3 border border-neutral-700 rounded text-[#CFCFE0]">Student (Coming Soon)</Link>
          <Link href="/institution" className="px-5 py-3 border border-neutral-700 rounded text-[#CFCFE0]">Institution (Coming Soon)</Link>
        </div>

        <div className="mt-8 text-sm text-[#9A9AB0]">Already have an account? <Link href="/login" className="underline">Login</Link></div>
      </div>
    </div>
  );
}
