import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("panel p-4", className)}>{children}</div>;
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "primary" | "accent";
  icon?: ReactNode;
}) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-[11px] tracking-wider uppercase">{label}</p>
        {icon ? <span className="text-muted-foreground shrink-0">{icon}</span> : null}
      </div>
      <p
        className={cn(
          "num mt-2 text-lg leading-tight break-words sm:text-xl",
          tone === "primary" && "text-primary",
          tone === "accent" && "text-accent",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </Panel>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <h2 className="truncate text-sm font-semibold tracking-[0.15em] uppercase">{children}</h2>
      {action}
    </div>
  );
}
