"use client";

import type { ReactNode } from "react";
import { Bell, Search } from "lucide-react";

import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppShellProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  userName?: string;
  userNim?: string;
  userEmail?: string;
  onSignOut?: () => void | Promise<void>;
};

export function AppShell({
  title,
  description,
  eyebrow = "Workspace",
  actions,
  children,
  contentClassName,
  userName,
  userNim,
  userEmail,
  onSignOut,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar
        userName={userName}
        userNim={userNim}
        userEmail={userEmail}
        onSignOut={onSignOut}
      />

      <main className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-copy">
            <p className="app-eyebrow">{eyebrow}</p>
            <h1 className="app-topbar-title">{title}</h1>
            {description ? <p className="app-topbar-description">{description}</p> : null}
          </div>

          <div className="flex items-center gap-2">
            {actions ?? (
              <>
                <Button variant="outline" size="icon" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Search">
                  <Search className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </header>

        <div className={cn("app-page", contentClassName)}>{children}</div>
      </main>
    </div>
  );
}
