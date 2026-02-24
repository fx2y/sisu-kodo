import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RunHeaderWid } from "@src/components/run-header-wid";
import { Suspense } from "react";
import { Terminal, Inbox, Settings, Book, BarChart3, ShieldCheck } from "lucide-react";
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
          <header className="border-b h-14 flex items-center px-4 justify-between shrink-0 bg-card z-10">
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

          <div className="flex flex-1 overflow-hidden">
            {/* Side Navigation */}
            <aside className="w-16 border-r flex flex-col items-center py-4 gap-4 bg-card/50 shrink-0">
              <nav className="flex flex-col gap-4">
                <NavButton icon={<Terminal size={20} />} label="Run Console" active />
                <NavButton icon={<Inbox size={20} />} label="HITL Inbox" />
                <NavButton icon={<Settings size={20} />} label="Ops Console" />
                <NavButton icon={<Book size={20} />} label="Recipe Registry" />
                <NavButton icon={<BarChart3 size={20} />} label="Throughput" />
                <NavButton icon={<ShieldCheck size={20} />} label="Signoff" />
              </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden relative">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}

function NavButton({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      title={label}
      className={`p-2 rounded-lg transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
      }`}
    >
      {icon}
    </button>
  );
}
