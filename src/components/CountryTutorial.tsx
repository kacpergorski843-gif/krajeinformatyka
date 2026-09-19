import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { Me } from "@/lib/api";

type TutorialStep = {
  title: string;
  text: string;
  path: string;
  targets: string[];
};

const STORAGE_PREFIX = "country-rp:tutorial:";
const COMPLETED = "completed";
const SKIPPED = "skipped";

const STEPS: TutorialStep[] = [
  {
    title: "TWOJE PAŃSTWO",
    text: "To jest centrum zarządzania Twoim państwem. Tutaj znajdziesz najważniejsze informacje o gospodarce, terytorium i potencjale militarnym.",
    path: "/panstwo",
    targets: ["tour-country-name", "tour-treasury", "tour-income", "tour-country-regions"],
  },
  {
    title: "GOSPODARKA",
    text: "KR to podstawowa waluta Country RP. Wykorzystujesz je między innymi do budowy fabryk, rozwoju infrastruktury i zakupu wyposażenia. Produkcja dzienna jest rozliczana o godzinie 20:00.",
    path: "/panstwo",
    targets: ["tour-treasury", "tour-income", "tour-resources"],
  },
  {
    title: "REGIONY",
    text: "Każdy region posiada 9 slotów. Możesz wykorzystać je do rozwoju gospodarczego i militarnego. W jednym regionie może znajdować się tylko jeden rodzaj zakładu surowcowego, maksymalnie 3 zakłady tego samego rodzaju oraz maksymalnie jedna fortyfikacja.",
    path: "/regiony",
    targets: ["tour-region", "tour-region-slots"],
  },
  {
    title: "FABRYKI",
    text: "Fabryki mają poziom, cenę, dzienną produkcję, wymagania i liczbę posiadanych sztuk. FABRYKI KUPUJE SIĘ SEKWENCYJNIE: I → II → III → IV → V. Każdy kolejny poziom wymaga poprzedniego.",
    path: "/sklep",
    targets: ["tour-factories", "tour-factory-card"],
  },
  {
    title: "WOJSKO",
    text: "Żołnierze i czołgi zwiększają potencjał głosów Twojego państwa. 500 000 żołnierzy = 1 potencjalny głos. 50 czołgów = 1 potencjalny głos. Potencjał rankingowy nie ma limitu.",
    path: "/panstwo",
    targets: ["tour-military"],
  },
  {
    title: "OBRONA PRZECIWLOTNICZA",
    text: "OPL jest przypisane do konkretnego regionu. Chroni właśnie ten region przed atakiem rakietowym. OPL nie jest jednym globalnym magazynem państwa — liczba OPL w każdym regionie jest niezależna.",
    path: "/regiony",
    targets: ["tour-region-opl"],
  },
  {
    title: "RAKIETY",
    text: "Rakiety służą do niszczenia infrastruktury przeciwnika. Każdy typ rakiety ma inne wymagania i efekt. Kolejność operacji: WYBIERZ RAKIETĘ → WYBIERZ PAŃSTWO → WYBIERZ REGION → WYBIERZ CEL → PODSUMOWANIE → POTWIERDZENIE. Rakieta jest zużywana po użyciu. Samouczek nie uruchamia prawdziwego ataku.",
    path: "/arsenal",
    targets: ["tour-missile-flow"],
  },
  {
    title: "RANKING",
    text: "Ranking pozwala porównać państwa według ich dziennego dochodu oraz potencjału militarnego. Główne kategorie to NAJWIĘKSZE ZAROBKI oraz POTENCJAŁ GŁOSÓW.",
    path: "/ranking",
    targets: ["tour-ranking-categories"],
  },
  {
    title: "HISTORIA OPERACJI",
    text: "Tutaj możesz sprawdzić działania wykonane przez Twoje państwo, między innymi operacje gospodarcze, militarne, rakietowe i związane z OPL. Możesz filtrować historię oraz wyświetlić pełny zapis.",
    path: "/panstwo",
    targets: ["tour-operations-history"],
  },
  {
    title: "SAMOUCZEK UKOŃCZONY",
    text: "Znasz już najważniejsze elementy Country RP.",
    path: "/panstwo",
    targets: [],
  },
];

function storageKey(userId: string) {
  return STORAGE_PREFIX + userId;
}

function readState(userId: string | undefined): { status: string; step: number; target: number } {
  if (!userId || typeof window === "undefined") return { status: "new", step: 0, target: 0 };
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return { status: "new", step: 0, target: 0 };
    const parsed = JSON.parse(raw) as { status?: string; step?: number; target?: number };
    return {
      status: parsed.status ?? "new",
      step: Math.max(0, Math.min(STEPS.length - 1, parsed.step ?? 0)),
      target: Math.max(0, parsed.target ?? 0),
    };
  } catch {
    return { status: "new", step: 0, target: 0 };
  }
}

function writeState(userId: string | undefined, value: { status: string; step: number; target: number }) {
  if (!userId || typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(value));
}

export function CountryTutorial({ me }: { me: Me | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const initial = useMemo(() => readState(me?.userId), [me?.userId]);
  const [status, setStatus] = useState(initial.status);
  const [step, setStep] = useState(initial.step);
  const [targetIndex, setTargetIndex] = useState(initial.target);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!me?.userId) return;
    const state = readState(me.userId);
    setStatus(state.status);
    setStep(state.step);
    setTargetIndex(state.target);
  }, [me?.userId]);

  const current = STEPS[step];

  useEffect(() => {
    if (status !== "active" || !current || current.targets.length === 0) {
      setRect(null);
      return;
    }
    if (location.pathname !== current.path) {
      void navigate({ to: current.path as never });
      return;
    }

    let frame = 0;
    let attempts = 0;
    const locate = () => {
      const id = current.targets[targetIndex] ?? current.targets[0];
      const element = document.querySelector('[data-tour="' + id + '"]') as HTMLElement | null;
      if (!element) {
        attempts += 1;
        if (attempts < 25) frame = window.setTimeout(locate, 120);
        else setRect(null);
        return;
      }
      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      frame = window.setTimeout(() => setRect(element.getBoundingClientRect()), 180);
    };
    locate();

    const onResize = () => {
      const id = current.targets[targetIndex] ?? current.targets[0];
      const element = document.querySelector('[data-tour="' + id + '"]') as HTMLElement | null;
      if (element) setRect(element.getBoundingClientRect());
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.clearTimeout(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [status, step, targetIndex, current, location.pathname, navigate]);

  useEffect(() => {
    if (status === "active" && step === STEPS.length - 1 && location.pathname !== "/panstwo") {
      void navigate({ to: "/panstwo" as never });
    }
  }, [status, step, location.pathname, navigate]);

  if (!me?.userId || status === "completed" || status === "skipped") return null;

  const start = () => {
    setStatus("active");
    setStep(0);
    setTargetIndex(0);
    writeState(me.userId, { status: "active", step: 0, target: 0 });
    void navigate({ to: "/panstwo" as never });
  };

  const skip = () => {
    setStatus(SKIPPED);
    writeState(me.userId, { status: SKIPPED, step, target: targetIndex });
  };

  const finish = () => {
    setStatus(COMPLETED);
    writeState(me.userId, { status: COMPLETED, step: STEPS.length - 1, target: 0 });
  };

  const next = () => {
    if (step === STEPS.length - 1) {
      finish();
      return;
    }
    if (targetIndex < current.targets.length - 1) {
      const nextTarget = targetIndex + 1;
      setTargetIndex(nextTarget);
      writeState(me.userId, { status: ACTIVE, step, target: nextTarget });
      return;
    }
    const nextStep = step + 1;
    setStep(nextStep);
    setTargetIndex(0);
    writeState(me.userId, { status: ACTIVE, step: nextStep, target: 0 });
    void navigate({ to: STEPS[nextStep].path as never });
  };

  const back = () => {
    if (targetIndex > 0) {
      const previousTarget = targetIndex - 1;
      setTargetIndex(previousTarget);
      writeState(me.userId, { status: "active", step, target: previousTarget });
      return;
    }
    if (step === 0) return;
    const previousStep = step - 1;
    const previousTarget = Math.max(0, STEPS[previousStep].targets.length - 1);
    setStep(previousStep);
    setTargetIndex(previousTarget);
    writeState(me.userId, { status: "active", step: previousStep, target: previousTarget });
    void navigate({ to: STEPS[previousStep].path as never });
  };

  if (status === "new") {
    return (
      <div className="country-tutorial-layer" role="dialog" aria-modal="true" aria-label="Witamy w Country RP">
        <div className="country-tutorial-backdrop" />
        <div className="country-tutorial-welcome panel">
          <p className="label-hud">ONBOARDING / COUNTRY RP</p>
          <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">WITAMY W COUNTRY RP</h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            Zarządzaj własnym państwem, rozwijaj gospodarkę, buduj armię i rywalizuj z innymi państwami.
          </p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button type="button" className="tutorial-primary" onClick={start}>ROZPOCZNIJ SAMOUCZEK</button>
            <button type="button" className="tutorial-secondary" onClick={skip}>POMIŃ</button>
          </div>
        </div>
      </div>
    );
  }

  const progress = Math.min(STEPS.length, step + 1);
  const tooltipStyle = rect
    ? {
        top: Math.min(window.innerHeight - 220, Math.max(12, rect.bottom + 14)),
        left: Math.min(window.innerWidth - 20, Math.max(12, rect.left + rect.width / 2)),
      }
    : undefined;

  return (
    <div className="country-tutorial-layer" role="dialog" aria-modal="true" aria-label="Samouczek Country RP">
      <div className="country-tutorial-backdrop" />
      {rect ? (
        <div
          className="country-tutorial-spotlight"
          style={{
            top: Math.max(4, rect.top - 6),
            left: Math.max(4, rect.left - 6),
            width: Math.min(window.innerWidth - Math.max(4, rect.left - 6), rect.width + 12),
            height: rect.height + 12,
          }}
        />
      ) : null}
      <div className="country-tutorial-progress">
        KROK {progress} / {STEPS.length}
      </div>
      <div className="country-tutorial-tooltip panel" style={tooltipStyle}>
        <p className="label-hud">{current.title}</p>
        <p className="mt-2 text-sm leading-relaxed">{current.text}</p>
        {step === 6 ? (
          <p className="text-primary mt-2 text-xs font-semibold uppercase tracking-[0.12em]">
            Tryb demonstracyjny — żaden atak nie zostanie uruchomiony.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="tutorial-secondary" onClick={skip}>POMIŃ SAMOUCZEK</button>
          {step > 0 || targetIndex > 0 ? (
            <button type="button" className="tutorial-secondary" onClick={back}>WRÓĆ</button>
          ) : null}
          <button type="button" className="tutorial-primary ml-auto" onClick={next}>
            {step === STEPS.length - 1 ? "PRZEJDŹ DO GRY" : "DALEJ"}
          </button>
        </div>
      </div>
    </div>
  );
}

const ACTIVE = "active";
