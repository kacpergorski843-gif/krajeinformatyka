import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, X } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { Me } from "@/lib/api";

type Step = {
  title: string;
  body: string;
  route: string;
  target?: string;
};

const STEPS: Step[] = [
  { title: "Twoje państwo", body: "To jest centrum zarządzania Twoim państwem. Tutaj znajdziesz najważniejsze informacje o gospodarce, terytorium i potencjale militarnym.", route: "/panstwo", target: "[data-tour='country-hero']" },
  { title: "Gospodarka", body: "KR to podstawowa waluta Country RP. Wykorzystujesz ją między innymi do budowy fabryk, rozwoju infrastruktury i zakupu wyposażenia. Produkcja dzienna jest rozliczana o godzinie 20:00.", route: "/panstwo", target: "[data-tour='economy']" },
  { title: "Regiony", body: "Każdy region posiada 9 slotów. Możesz wykorzystać je do rozwoju gospodarczego i militarnego. W regionie może znajdować się jeden rodzaj zakładu surowcowego, maksymalnie 3 zakłady tego samego rodzaju oraz maksymalnie jedna fortyfikacja.", route: "/regiony", target: "[data-tour='region']" },
  { title: "Fabryki", body: "Fabryki mają poziom, cenę, dzienną produkcję, wymagania i liczbę posiadanych sztuk. Kupuje się je sekwencyjnie: I → II → III → IV → V. Każdy kolejny poziom wymaga poprzedniego.", route: "/sklep", target: "[data-tour='factories']" },
  { title: "Wojsko", body: "Żołnierze i czołgi zwiększają potencjał głosów Twojego państwa. 500 000 żołnierzy = 1 potencjalny głos, a 50 czołgów = 1 potencjalny głos. Potencjał rankingowy nie ma limitu.", route: "/arsenal", target: "[data-tour='military']" },
  { title: "Obrona przeciwlotnicza", body: "OPL jest przypisane do konkretnego regionu i chroni właśnie ten region przed atakiem rakietowym. OPL nie jest jednym globalnym magazynem państwa — liczba OPL w każdym regionie jest niezależna.", route: "/regiony", target: "[data-tour='aa']" },
  { title: "Rakiety", body: "Rakiety służą do niszczenia infrastruktury przeciwnika. Samouczek pokazuje wyłącznie interfejs — nie uruchamia prawdziwego ataku. Kolejność to: rakieta → państwo → region → cel → podsumowanie → potwierdzenie. Rakieta jest zużywana po użyciu.", route: "/arsenal", target: "[data-tour='missiles']" },
  { title: "Ranking", body: "Ranking pozwala porównać państwa według ich dziennego dochodu oraz potencjału militarnego. Zobaczysz kategorie: Największe zarobki oraz Potencjał głosów.", route: "/ranking", target: "[data-tour='ranking']" },
  { title: "Historia operacji", body: "Tutaj możesz sprawdzić działania wykonane przez Twoje państwo, między innymi operacje gospodarcze, militarne, rakietowe i związane z OPL.", route: "/panstwo", target: "[data-tour='history']" },
  { title: "Gotowe", body: "Znasz już najważniejsze elementy Country RP. Możesz teraz przejść do gry i rozwijać swoje państwo.", route: "/panstwo" },
];

const STATUS_KEY = "country-rp:tutorial-status";
const STEP_KEY = "country-rp:tutorial-step";

function getStatus(userId: string) {
  try { return localStorage.getItem(`${STATUS_KEY}:${userId}`) ?? ""; } catch { return ""; }
}
function setStatus(userId: string, status: "skipped" | "completed") {
  try { localStorage.setItem(`${STATUS_KEY}:${userId}`, status); } catch {}
}
function getSavedStep(userId: string) {
  try { return Math.min(STEPS.length - 1, Math.max(0, Number(localStorage.getItem(`${STEP_KEY}:${userId}`) ?? 0))); } catch { return 0; }
}
function saveStep(userId: string, step: number) {
  try { localStorage.setItem(`${STEP_KEY}:${userId}`, String(step)); } catch {}
}

export function CountryTutorial({ me }: { me: Me | null }) {
  const router = useRouter();
  const [welcome, setWelcome] = useState(false);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [targetReady, setTargetReady] = useState(false);

  useEffect(() => {
    if (!me?.userId) return;
    const status = getStatus(me.userId);
    if (!status) setWelcome(true);
    const onStart = () => {
      setWelcome(false);
      setStep(0);
      saveStep(me.userId, 0);
      setActive(true);
      void router.navigate({ to: STEPS[0].route });
    };
    window.addEventListener("country-rp:start-tutorial", onStart);
    return () => window.removeEventListener("country-rp:start-tutorial", onStart);
  }, [me?.userId, router]);

  useEffect(() => {
    if (!active || !me?.userId) return;
    saveStep(me.userId, step);
    const current = STEPS[step];
    if (!current.target) {
      setTargetReady(true);
      return;
    }
    setTargetReady(false);
    let cancelled = false;
    let attempts = 0;
    const locate = () => {
      if (cancelled) return;
      const el = document.querySelector(current.target!);
      if (el) {
        (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
        setTargetReady(true);
        return;
      }
      attempts += 1;
      if (attempts < 30) window.setTimeout(locate, 100);
      else setTargetReady(false);
    };
    window.setTimeout(locate, 80);
    return () => { cancelled = true; };
  }, [active, step, me?.userId]);

  function finish(status: "skipped" | "completed") {
    if (me?.userId) setStatus(me.userId, status);
    setActive(false);
    setWelcome(false);
  }

  function next() {
    if (!me?.userId) return;
    if (step >= STEPS.length - 1) { finish("completed"); return; }
    const nextStep = step + 1;
    setStep(nextStep);
    saveStep(me.userId, nextStep);
    void router.navigate({ to: STEPS[nextStep].route });
  }

  function back() {
    if (step <= 0) return;
    const prev = step - 1;
    setStep(prev);
    if (me?.userId) saveStep(me.userId, prev);
    void router.navigate({ to: STEPS[prev].route });
  }

  if (!me?.userId) return null;

  return <>
    {welcome ? (
      <div className="tutorial-welcome-backdrop">
        <section className="tutorial-welcome" role="dialog" aria-modal="true">
          <div className="tutorial-kicker"><BookOpen className="size-4" /> NOWY DOWÓDCA</div>
          <div className="tutorial-welcome-mark"><BookOpen className="size-7" /></div>
          <h2>WITAMY W COUNTRY RP</h2>
          <p>Zarządzaj własnym państwem, rozwijaj gospodarkę, buduj armię i rywalizuj z innymi państwami.</p>
          <div className="tutorial-welcome-actions">
            <Button onClick={() => { setWelcome(false); setStep(0); setActive(true); saveStep(me.userId, 0); void router.navigate({ to: STEPS[0].route }); }}>ROZPOCZNIJ SAMOUCZEK</Button>
            <Button variant="ghost" onClick={() => finish("skipped")}>POMIŃ</Button>
          </div>
        </section>
      </div>
    ) : null}

    {active ? (
      <div className="tutorial-overlay" aria-live="polite">
        {targetReady && STEPS[step].target ? <div className="tutorial-target-ring" /> : null}
        <div className={`tutorial-card ${step === STEPS.length - 1 ? "tutorial-card-finish" : ""}`}>
          <div className="tutorial-card-top">
            <span>KROK {step + 1} / {STEPS.length}</span>
            <button type="button" onClick={() => finish("skipped")} aria-label="Pomiń samouczek"><X className="size-4" /></button>
          </div>
          <div className="tutorial-progress"><span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
          <div className="tutorial-card-body">
            {step === STEPS.length - 1 ? <Check className="tutorial-finish-icon size-7" /> : null}
            <p className="tutorial-card-kicker">COUNTRY RP / ONBOARDING</p>
            <h3>{STEPS[step].title === "Gotowe" ? "SAMOUCZEK UKOŃCZONY" : STEPS[step].title}</h3>
            <p>{STEPS[step].body}</p>
          </div>
          <div className="tutorial-card-actions">
            {step > 0 ? <Button variant="ghost" onClick={back}><ArrowLeft className="size-4" /> WRÓĆ</Button> : <span />}
            <Button onClick={next}>{step === STEPS.length - 1 ? "PRZEJDŹ DO GRY" : "DALEJ"} <ArrowRight className="size-4" /></Button>
          </div>
        </div>
      </div>
    ) : null}
  </>;
}
