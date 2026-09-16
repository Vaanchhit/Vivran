import type { Metadata } from 'next';
import { ThemeProvider } from '@/lib/theme-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vivran',
  description: 'AI-powered workspace for teachers, students, and institutions',
};

/**
 * Deliberately minimal: the marketing site and the authenticated product
 * used to both mount `AuthProvider` here, which meant the public landing
 * page could not render a single pixel until a Supabase session check (and
 * sometimes a backend provisioning round-trip) resolved — so any auth/DB
 * hiccup took the whole public site down with it, not just the product.
 * `AuthProvider` now lives only in `app/(app)/layout.tsx`, scoped to the
 * teacher product. Marketing pages under `app/(marketing)/` render
 * independently of it. See `app/(marketing)/layout.tsx` / `app/(app)/layout.tsx`.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body className="bg-background text-foreground min-h-screen antialiased font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}