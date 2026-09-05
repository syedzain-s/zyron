import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';

/**
 * Fonts are self-hosted from npm rather than fetched through next/font/google.
 * Google Fonts is a build-time network call; on a slow or filtered connection
 * `next dev` stalls with "The user aborted a request". These packages ship the
 * woff2 files inside node_modules, so the app builds fully offline.
 *
 * Libre Baskerville carries the display type. A serif is what separates this
 * from every other dark-mode dashboard — the geometric sans that was here
 * before read as generic tech, not as authority.
 */
import '@fontsource/libre-baskerville/400.css';
import '@fontsource/libre-baskerville/500.css';
import '@fontsource/libre-baskerville/700.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';

import { Navbar } from '@/components/ui/Navbar';
import { Preloader } from '@/components/ui/Preloader';
import { ScrollProgress } from '@/components/ui/ScrollProgress';

export const metadata: Metadata = {
  title: 'ZYRON — Autonomous Executive Intelligence',
  description:
    'A personal chief of staff, not a chat window. Twenty-three modules that read, decide and act — stopping at one gate for anything that touches the outside world.',
  openGraph: {
    title: 'ZYRON — Autonomous Executive Intelligence',
    description: 'Your authority, running while you sleep.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#04060C',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <body className="grain relative min-h-screen bg-ink font-sans">
        {/* Keyboard users should reach the content without tabbing the whole nav. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-6 focus:top-6 focus:z-[100] focus:rounded-full focus:bg-gold focus:px-5 focus:py-2.5 focus:text-[0.7rem] focus:uppercase focus:tracking-[0.2em] focus:text-ink"
        >
          Skip to content
        </a>

        <Preloader />
        <ScrollProgress />
        <Navbar />

        {/* Wrapped here rather than adding an id inside every page, so the
            skip link has a real target on every route. */}
        <div id="main">{children}</div>
      </body>
    </html>
  );
}
