import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Model Board',
  description: 'LLM model pricing, performance, and selection dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
