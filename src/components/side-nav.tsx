"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Terminal, Inbox, Settings, Book, BarChart3, ShieldCheck } from "lucide-react";

export function SideNav() {
  const searchParams = useSearchParams();
  const activeBoard = searchParams.get("board") || "run";

  return (
    <aside className="w-16 border-r flex flex-col items-center py-4 gap-4 bg-card/50 shrink-0">
      <nav className="flex flex-col gap-4">
        <NavButton
          icon={<Terminal size={20} />}
          label="Run Console"
          href="/?board=run"
          active={activeBoard === "run"}
        />
        <NavButton
          icon={<Inbox size={20} />}
          label="HITL Inbox"
          href="/?board=hitl-inbox"
          active={activeBoard === "hitl-inbox"}
        />
        <NavButton
          icon={<Settings size={20} />}
          label="Ops Console"
          href="/?board=ops"
          active={activeBoard === "ops"}
        />
        <NavButton
          icon={<Book size={20} />}
          label="Recipe Registry"
          href="/?board=recipe"
          active={activeBoard === "recipe"}
        />
        <NavButton
          icon={<BarChart3 size={20} />}
          label="Throughput"
          href="/?board=throughput"
          active={activeBoard === "throughput"}
        />
        <NavButton
          icon={<ShieldCheck size={20} />}
          label="Signoff"
          href="/?board=signoff"
          active={activeBoard === "signoff"}
        />
      </nav>
    </aside>
  );
}

function NavButton({
  icon,
  label,
  active = false,
  href
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={`p-2 rounded-lg transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
      }`}
    >
      {icon}
    </Link>
  );
}
