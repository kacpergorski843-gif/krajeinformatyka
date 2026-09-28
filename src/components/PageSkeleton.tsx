import type { ReactNode } from "react";

type PageSkeletonProps = {
  rows?: number;
  cards?: number;
  children?: ReactNode;
};

function Shimmer({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-muted/60 ${className}`} />;
}

export function PageSkeleton({ rows = 4, cards = 3, children }: PageSkeletonProps) {
  if (children) return <>{children}</>;

  return (
    <div aria-busy="true" aria-label="Wczytywanie danych" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="hud-frame rounded-xl border border-border/70 p-4">
            <div className="flex items-center gap-3">
              <Shimmer className="size-10 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Shimmer className="h-4 w-2/3" />
                <Shimmer className="h-3 w-1/2" />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Shimmer className="h-3 w-full" />
              <Shimmer className="h-3 w-5/6" />
              <Shimmer className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
      <div className="hud-frame overflow-hidden rounded-xl border border-border/70">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3 border-b border-border/60 p-3 last:border-b-0">
            <Shimmer className="h-4 w-8" />
            <Shimmer className="h-4 flex-1" />
            <Shimmer className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
