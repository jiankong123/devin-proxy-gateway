import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { KeyRound, ListChecks, LogOut, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearAdminToken } from "@/lib/auth";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const items: NavItem[] = [
  { to: "/keys", label: "Proxy Keys", icon: <KeyRound className="h-4 w-4" /> },
  { to: "/usage", label: "Usage Logs", icon: <ListChecks className="h-4 w-4" /> },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-[#1e2d3d] bg-[#0d1117]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/keys" className="flex items-center gap-2 text-slate-100 hover:text-white">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-600 text-white">
              <Zap className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Devin Proxy Gateway
            </span>
            <span className="rounded bg-[#1e2d3d] px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
              v0.2
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {items.map((it) => {
              const active = location === it.to || location.startsWith(`${it.to}/`);
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-[#1e2d3d] text-white"
                      : "text-slate-400 hover:bg-[#1e2d3d]/60 hover:text-slate-100"
                  }`}
                >
                  {it.icon}
                  {it.label}
                </Link>
              );
            })}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearAdminToken();
                window.location.assign("/dashboard/");
              }}
              className="ml-2"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
