import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vivran',
  description: 'AI-powered workspace for teachers, students, and institutions',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#09090E] text-[#F4F4F6] min-h-screen antialiased font-sans">
        <AuthProvider>
          <header className="w-full border-b border-neutral-800/40 bg-[#07070A]/60">
            <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
              <Link href="/landing" className="font-semibold">Vivran</Link>
              <nav className="space-x-4 text-sm text-[#CFCFE0]">
                <Link href="/landing" className="hover:underline">Home</Link>
                <Link href="/teacher" className="hover:underline">Teacher</Link>
                <Link href="/student" className="hover:underline">Student</Link>
                <Link href="/institution" className="hover:underline">Institution</Link>
                <Link href="/login" className="hover:underline">Login</Link>
              </nav>
            </div>
          </header>

          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}

