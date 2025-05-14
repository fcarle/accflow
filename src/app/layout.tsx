'use client';

import './globals.css';
import { Toaster } from 'sonner';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
        <title>AccFlow - Accountancy Workflow Platform</title>
        <meta name="description" content="AccFlow - Accountancy Workflow Platform" />
      </head>
      <body>
        {children}
        <Toaster position="top-right" closeButton />
      </body>
    </html>
  );
}
