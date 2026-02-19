import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RunHeaderWid } from "@src/components/run-header-wid";
import { Suspense } from "react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "Sisu Kodo",
  description: "Deterministic workflow harness"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <div className="flex flex-col h-screen overflow-hidden">
          {/* Header Placeholder */}
          <header className="border-b h-14 flex items-center px-4 justify-between shrink-0 bg-card">
            <div className="flex items-center gap-4">
              <span className="font-bold text-lg tracking-tight">SISU KODO</span>
              <div className="h-4 w-px bg-border" />
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                Deterministic Harness
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Suspense fallback={<div className="h-7 w-32 bg-muted animate-pulse rounded-md" />}>
                <RunHeaderWid />
              </Suspense>
            </div>
          </header>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden">{children}</div>
        </div>
      </body>
    </html>
  );
}
