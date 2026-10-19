import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("panel p-5 sm:p-6", className)}>{children}</div>;
}

export function Stat({ label, value, hint, tone = "default", icon }: {
  label: string; value: string; hint?: string; tone?: "default" | "primary" | "accent"; icon?: ReactNode;
}) {
  return (
    <div className={cn("stat-module", tone !== "default" && `stat-module-${tone}`)}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="stat-label">{label}</p>
        {icon ? <span className="stat-icon">{icon}</span> : null}
      </div>
      <p className={cn("stat-value num", tone === "primary" && "text-primary", tone === "accent" && "text-accent")}>{value}</p>
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-heading section-heading-command">
      <h2>{children}</h2>
      {action ? <div className="section-heading-action">{action}</div> : null}
    </div>
  );
}
