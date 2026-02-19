import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
              {/* workflowID Copy Slot */}
              <div className="flex items-center gap-2 bg-muted px-3 py-1 rounded-md border text-sm font-mono group cursor-pointer hover:bg-accent transition-colors">
                <span className="text-muted-foreground/50">wid:</span>
                <span className="max-w-[120px] truncate">none</span>
                <div className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                  >
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden">{children}</div>
        </div>
      </body>
    </html>
  );
}
