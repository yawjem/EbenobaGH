import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Ebenoba GH Admin', description: 'Ebenoba GH marketplace management' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body>{children}</body>
    </html>
  );
}
