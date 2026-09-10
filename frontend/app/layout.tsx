import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import { GlobalHeader } from '@/app/components/global-header';
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
    <html lang="en" data-theme="dark">
      <body className="bg-background text-foreground min-h-screen antialiased font-sans">
        <ThemeProvider>
          <AuthProvider>
            <GlobalHeader />
            <main>{children}</main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}