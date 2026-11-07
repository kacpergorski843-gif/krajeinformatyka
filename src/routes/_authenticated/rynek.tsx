import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp, Clock3, Filter, Handshake, MessageCircle, Package, Search, Tag, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Panel, SectionTitle } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { meQuery } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/rynek")({
  head: () => ({
    meta: [
      { title: "Rynek — Nation Dynamics" },
      { name: "description", content: "Rynek państw — oferty i negocjacje" },
    ],
  }),
  component: MarketPage,
});

type Category = "Surowce" | "Uzbrojenie" | "Produkty";
type Offer = {
  id: number;
  title: string;
  category: Category;
  country: string;
  flag: string;
  amount: number;
  price: number;
  unit: string;
  description: string;
  days: number;
};

const INITIAL_OFFERS: Offer[] = [
  { id: 1, title: "Ropa naftowa", category: "Surowce", country: "Polska", flag: "🇵🇱", amount: 1200, price: 45, unit: "szt.", description: "Duży zapas ropy gotowy do natychmiastowej wymiany.", days: 2 },
  { id: 2, title: "Węgiel", category: "Surowce", country: "Niemcy", flag: "🇩🇪", amount: 5000, price: 12, unit: "szt.", description: "Sprzedaż nadwyżek wydobycia.", days: 1 },
  { id: 3, title: "Zestawy żołnierzy", category: "Uzbrojenie", country: "Francja", flag: "🇫🇷", amount: 25, price: 320, unit: "zest.", description: "Gotowe zestawy wojskowe.", days: 4 },
  { id: 4, title: "Miedź", category: "Surowce", country: "Włochy", flag: "🇮🇹", amount: 850, price: 28, unit: "szt.", description: "Dostępna od ręki.", days: 0 },
  { id: 5, title: "Zestawy czołgów", category: "Uzbrojenie", country: "Hiszpania", flag: "🇪🇸", amount: 12, price: 790, unit: "zest.", description: "Ograniczona liczba zestawów.", days: 3 },
  { id: 6, title: "Żelazo", category: "Surowce", country: "Czechy", flag: "🇨🇿", amount: 2400, price: 19, unit: "szt.", description: "Oferta hurtowa.", days: 5 },
];

type Proposal = { offerId: number; offerTitle: string; country: string; quantity: number; price: number; status: "Oczekuje" | "Kontroferta" | "Zaakceptowana" | "Odrzucona" };

function MarketPage() {
  const { data: me } = useQuery(meQuery);
  const [offers] = useState(INITIAL_OFFERS);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Wszystkie");
  const [sort, setSort] = useState("price");
  const [view, setView] = useState<"offers" | "proposals">("offers");
  const [selected, setSelected] = useState<Offer | null>(null);
  const [quantity, setQuantity] = useState("100");
  const [price, setPrice] = useState("");
  const [counterIndex, setCounterIndex] = useState<number | null>(null);
  const [counterPrice, setCounterPrice] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([
    { offerId: 1, offerTitle: "Ropa naftowa", country: "Polska", quantity: 100, price: 40, status: "Kontroferta" },
    { offerId: 3, offerTitle: "Zestawy żołnierzy", country: "Francja", quantity: 10, price: 300, status: "Oczekuje" },
  ]);

  const filtered = useMemo(() => offers
    .filter((offer) => category === "Wszystkie" || offer.category === category)
    .filter((offer) => (offer.title + " " + offer.country).toLocaleLowerCase("pl-PL").includes(search.trim().toLocaleLowerCase("pl-PL")))
    .sort((a, b) => sort === "price" ? a.price - b.price : sort === "newest" ? a.days - b.days : b.amount - a.amount), [offers, category, search, sort]);

  function openProposal(offer: Offer) {
    setSelected(offer);
    setQuantity(String(Math.min(100, offer.amount)));
    setPrice(String(offer.price));
  }

  function submitProposal() {
    if (!selected) return;
    const qty = Math.floor(Number(quantity));
    const amount = Number(price);
    if (!Number.isFinite(qty) || qty < 1 || qty > selected.amount || !Number.isFinite(amount) || amount <= 0) return;
    setProposals((current) => [{ offerId: selected.id, offerTitle: selected.title, country: selected.country, quantity: qty, price: amount, status: "Oczekuje" }, ...current]);
    setSelected(null);
    setView("proposals");
  }

  function submitCounterProposal() {
    if (counterIndex === null) return;
    const nextPrice = Number(counterPrice);
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) return;
    setProposals((current) => current.map((p, i) => i === counterIndex ? { ...p, price: nextPrice, status: "Kontroferta" } : p));
    setCounterIndex(null);
  }

  return (
    <AppShell me={me ?? null} title="Rynek">
      <div className="mb-4 rounded-xl border border-primary/25 bg-primary/[0.05] p-3 text-xs leading-relaxed text-muted-foreground">
        <div className="flex items-center gap-2 font-semibold text-primary"><Tag className="size-4" /> Prototyp rynku</div>
        Widoczne oferty i negocjacje są przykładowe. Zmiany działają lokalnie w tym widoku — bez pobierania ani przekazywania zasobów.
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setView("offers")} className={`rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${view === "offers" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}>
          <span className="flex items-center justify-center gap-2"><Package className="size-4" /> Oferty</span>
        </button>
        <button type="button" onClick={() => setView("proposals")} className={`rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${view === "proposals" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}>
          <span className="flex items-center justify-center gap-2"><Handshake className="size-4" /> Negocjacje <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px]">{proposals.length}</span></span>
        </button>
      </div>

      {view === "offers" ? (
        <>
          <div className="mb-4 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Szukaj ofert lub państw..." aria-label="Szukaj ofert" className="pl-9 pr-9" />
              {search ? <button type="button" onClick={() => setSearch("")} aria-label="Wyczyść wyszukiwanie" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="size-4" /></button> : null}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {["Wszystkie", "Surowce", "Uzbrojenie", "Produkty"].map((item) => (
                <button key={item} type="button" onClick={() => setCategory(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${category === item ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{item}</button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground"><Filter className="mr-1 inline size-3.5" /> {filtered.length} ofert</p>
              <label className="flex items-center gap-2 text-xs text-muted-foreground"><ArrowDownUp className="size-3.5" />
                <select value={sort} onChange={(event) => setSort(event.target.value)} className="max-w-[145px] rounded-md border border-border bg-card px-2 py-2 text-xs text-foreground">
                  <option value="price">Najniższa cena</option><option value="newest">Najnowsze</option><option value="amount">Największa ilość</option>
                </select>
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((offer) => (
              <Panel key={offer.id} className="flex min-w-0 flex-col gap-3 border-border/80 p-4 transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{offer.category}</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="size-3" /> {offer.days === 0 ? "Dzisiaj" : `${offer.days} dni temu`}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold">{offer.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{offer.flag} {offer.country}</p>
                  <p className="mt-2 line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">{offer.description}</p>
                </div>
                <div className="mt-auto border-t border-border/70 pt-3">
                  <div className="flex items-end justify-between gap-2">
                    <div><p className="text-[10px] text-muted-foreground">Cena za {offer.unit}</p><p className="num text-xl font-semibold text-primary">{offer.price.toLocaleString("pl-PL")} KR</p></div>
                    <p className="text-right text-xs text-muted-foreground">{offer.amount.toLocaleString("pl-PL")} {offer.unit}</p>
                  </div>
                  <Button className="mt-3 w-full" onClick={() => openProposal(offer)}><MessageCircle className="mr-2 size-4" /> Zaproponuj cenę</Button>
                </div>
              </Panel>
            ))}
          </div>
          {filtered.length === 0 ? <Panel className="p-8 text-center"><p className="font-semibold">Brak pasujących ofert</p><p className="mt-1 text-sm text-muted-foreground">Zmień wyszukiwanie lub kategorię.</p></Panel> : null}
        </>
      ) : (
        <div className="space-y-3">
          <SectionTitle>Twoje propozycje</SectionTitle>
          {proposals.map((proposal, index) => (
            <Panel key={`${proposal.offerId}-${index}`} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div><h3 className="font-semibold">{proposal.offerTitle}</h3><p className="mt-1 text-xs text-muted-foreground">Sprzedający: {proposal.country}</p></div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${proposal.status === "Kontroferta" ? "bg-amber-500/10 text-amber-600" : proposal.status === "Zaakceptowana" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>{proposal.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-secondary/40 p-3">
                <div><p className="text-[10px] text-muted-foreground">Ilość</p><p className="num font-semibold">{proposal.quantity.toLocaleString("pl-PL")}</p></div>
                <div><p className="text-[10px] text-muted-foreground">Twoja cena / szt.</p><p className="num font-semibold">{proposal.price.toLocaleString("pl-PL")} KR</p></div>
              </div>
              {proposal.status !== "Zaakceptowana" && proposal.status !== "Odrzucona" ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setProposals((current) => current.map((p, i) => i === index ? { ...p, status: "Zaakceptowana" } : p))}>Akceptuj</Button>
                  <Button size="sm" variant="outline" onClick={() => { setCounterIndex(index); setCounterPrice(String(proposal.price)); }}>Kontruj cenę</Button>
                  <Button size="sm" variant="ghost" onClick={() => setProposals((current) => current.map((p, i) => i === index ? { ...p, status: "Odrzucona" } : p))}>Odrzuć</Button>
                </div>
              ) : null}
            </Panel>
          ))}
          {proposals.length === 0 ? <Panel className="p-8 text-center text-sm text-muted-foreground">Nie masz jeszcze żadnych propozycji.</Panel> : null}
        </div>
      )}


      <Dialog open={counterIndex !== null} onOpenChange={(open) => !open && setCounterIndex(null)}>
        <DialogContent className="admin-dialog">
          <DialogHeader><DialogTitle>Zaproponuj cenę kontrującą</DialogTitle><DialogDescription>Zmień kwotę i wyślij kontrpropozycję. Bez wiadomości tekstowych.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">Nowa cena za sztukę (KR)</label>
            <Input type="number" min="1" value={counterPrice} onChange={(event) => setCounterPrice(event.target.value)} />
            <Button className="w-full" onClick={submitCounterProposal} disabled={!Number.isFinite(Number(counterPrice)) || Number(counterPrice) <= 0}>Wyślij kontrofertę</Button>
          </div>
        </DialogContent>
      </Dialog>
\n      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="admin-dialog">
          <DialogHeader><DialogTitle>Zaproponuj własną cenę</DialogTitle><DialogDescription>{selected ? `${selected.title} · oferta ${selected.flag} ${selected.country}` : "Ustal ilość i cenę."} Nie wysyłasz wiadomości tekstowej — tylko propozycję handlową.</DialogDescription></DialogHeader>
          {selected ? <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mb-1.5 block text-xs text-muted-foreground">Ilość (max. {selected.amount})</label><Input type="number" min="1" max={selected.amount} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
              <div><label className="mb-1.5 block text-xs text-muted-foreground">Cena za sztukę (KR)</label><Input type="number" min="1" value={price} onChange={(event) => setPrice(event.target.value)} /></div>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3 text-sm"><div className="flex justify-between text-muted-foreground"><span>Wartość propozycji</span><span className="num font-semibold text-foreground">{(Math.max(0, Number(quantity) || 0) * Math.max(0, Number(price) || 0)).toLocaleString("pl-PL")} KR</span></div><p className="mt-1 text-[11px] text-muted-foreground">Cena sprzedającego: {selected.price} KR / szt.</p></div>
            <Button className="w-full" onClick={submitProposal} disabled={!Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > selected.amount || !Number.isFinite(Number(price)) || Number(price) <= 0}>Wyślij propozycję</Button>
          </div> : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
