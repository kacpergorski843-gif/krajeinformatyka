import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { meQuery } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/masterki")({
  head: () => ({
    meta: [
      { title: "Masterki — COUNTRY RP" },
      { name: "description", content: "Masterki" },
    ],
  }),
  component: MasterkiPage,
});

function MasterkiPage() {
  const { data: me } = useQuery(meQuery);

  return (
    <AppShell me={me ?? null} title="Masterki">
      <section className="mx-auto w-full max-w-3xl px-1 pb-8" aria-label="Kolekcja masterek">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Kolekcja osiągnięć
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight">Masterki</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Unikalne odznaki zapewniające stałe ulepszenia.
          </p>
        </div>

        <article className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="relative isolate flex items-center gap-4 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4 sm:gap-6 sm:p-6">
            <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" />
            <div className="relative grid h-28 w-24 shrink-0 place-items-center sm:h-32 sm:w-28">
              <div className="absolute h-[5.7rem] w-[5.7rem] rotate-45 rounded-[1.35rem] border border-slate-400/80 bg-gradient-to-br from-slate-300 via-slate-600 to-slate-950 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.55),inset_-4px_-5px_8px_rgba(0,0,0,0.8),0_8px_18px_rgba(0,0,0,0.55)] sm:h-24 sm:w-24" />
              <div className="absolute grid h-[4.65rem] w-[4.65rem] rotate-45 place-items-center rounded-[1.05rem] border border-slate-300/70 bg-gradient-to-br from-slate-700 via-slate-900 to-black shadow-[inset_1px_1px_4px_rgba(255,255,255,0.25)] sm:h-20 sm:w-20" />
              <svg
                viewBox="0 0 64 72"
                className="relative z-10 h-[4.4rem] w-[4rem] drop-shadow-[0_3px_4px_rgba(0,0,0,0.8)] sm:h-20 sm:w-[4.5rem]"
                role="img"
                aria-label="Stalowa tarcza z symbolem muru"
              >
                <defs>
                  <linearGradient id="iron-shield" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#f1f5f9" />
                    <stop offset=".45" stopColor="#94a3b8" />
                    <stop offset="1" stopColor="#334155" />
                  </linearGradient>
                </defs>
                <path d="M32 3 57 12v21c0 16-10 27-25 36C17 60 7 49 7 33V12L32 3Z" fill="#0f172a" stroke="url(#iron-shield)" strokeWidth="4" />
                <path d="M32 10 50 17v16c0 12-7 21-18 28C21 54 14 45 14 33V17l18-7Z" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />
                <path d="M19 29h26v17H19zM16 25h32v5H16zM24 20h7v9h-7zM34 20h7v9h-7z" fill="#cbd5e1" stroke="#475569" strokeWidth="1.2" />
                <path d="M23 36h5v10h-5zM36 36h5v10h-5z" fill="#334155" />
                <path d="M32 12v8" stroke="#fff" strokeOpacity=".65" strokeWidth="1.5" />
              </svg>
              <div className="absolute bottom-0 h-1 w-12 rounded-full bg-sky-300/70 blur-sm" />
            </div>

            <div className="relative min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center rounded-full border border-sky-300/25 bg-sky-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                Odznaka obronna
              </div>
              <h3 className="text-xl font-extrabold leading-tight tracking-wide text-slate-50 sm:text-2xl">
                Żelazna Obrona
              </h3>
              <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-300 sm:text-sm">
                Symbol niezłomności i skutecznej obrony swojego państwa.
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Wymaganie
            </p>
            <div className="mt-2 flex items-start gap-3">
              <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3 14.8 8.7 21 9.6l-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Wygraj minimum 10 wojen obronnych</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Po spełnieniu wymagania odblokujesz tę masterkę.
                </p>
              </div>
            </div>
          </div>
        </article>
      </section>
    </AppShell>
  );
}
