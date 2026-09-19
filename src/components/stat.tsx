import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("panel p-5 sm:p-6", className)}>{children}</div>;
}

export function Stat({ label, value, hint, tone = "default", icon }: {
  label: string; value: string; hint?: string; tone?: "default" | "primary" | "accent"; icon?: ReactNode;
}) {
  return <Panel className="stat-card">
    <div className="flex items-start justify-between gap-3">
      <p className="stat-label">{label}</p>
      {icon ? <span className="stat-icon">{icon}</span> : null}
    </div>
    <p className={cn("num mt-3 break-words text-2xl font-semibold leading-none sm:text-3xl",
      tone === "primary" && "text-primary", tone === "accent" && "text-accent")}>{value}</p>
    {hint ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
  </Panel>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="section-heading">
    <div className="min-w-0"><p className="label-hud">Operations</p><h2>{children}</h2></div>
    {action}
  </div>;
}
