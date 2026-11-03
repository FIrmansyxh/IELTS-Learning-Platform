import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import { id } from '@/i18n/id';
import './globals.css';

const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const heading = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: id.app.name, template: `%s | ${id.app.name}` },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${body.variable} ${heading.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          {id.app.skipToContent}
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
