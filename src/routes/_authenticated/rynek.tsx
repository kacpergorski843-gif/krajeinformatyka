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

type Proposal = { offerId: number; offerTitle: string; country: string; quantity: number; price: number; status: "Oczekuje" | "Kontroferta" | "Zaakceptowana" | "Odrzucona"; lastOfferBy: "Ty" | "Sprzedający" };

function MarketPage() {
  const { data: me } = useQuery(meQuery);
  const [offers] = useState(INITIAL_OFFERS);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Wszystkie");
  const [sort, setSort] = useState("price");
  const [view, setView] = useState<"offers" | "proposals">("offers");
  const [selected, setSelected] = useState<Offer | null>(null);
  const [detailsOffer, setDetailsOffer] = useState<Offer | null>(null);
  const [quantity, setQuantity] = useState("100");
  const [price, setPrice] = useState("");
  const [counterIndex, setCounterIndex] = useState<number | null>(null);
  const [counterPrice, setCounterPrice] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([
    { offerId: 1, offerTitle: "Ropa naftowa", country: "Polska", quantity: 100, price: 40, status: "Kontroferta", lastOfferBy: "Sprzedający" },
    { offerId: 3, offerTitle: "Zestawy żołnierzy", country: "Francja", quantity: 10, price: 300, status: "Oczekuje", lastOfferBy: "Ty" },
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
    setProposals((current) => [{ offerId: selected.id, offerTitle: selected.title, country: selected.country, quantity: qty, price: amount, status: "Oczekuje", lastOfferBy: "Ty" }, ...current]);
    setSelected(null);
    setView("proposals");
  }

  function submitCounterProposal() {
    if (counterIndex === null) return;
    const nextPrice = Number(counterPrice);
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) return;
    setProposals((current) => current.map((p, i) => i === counterIndex ? { ...p, price: nextPrice, status: "Kontroferta", lastOfferBy: "Sprzedający" } : p));
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
              <button key={offer.id} type="button" onClick={() => setDetailsOffer(offer)} className="panel flex min-w-0 cursor-pointer flex-col gap-3 border-border/80 p-4 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{offer.category}</span>
                  <span className="text-xs text-muted-foreground">{offer.flag} {offer.country}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold">{offer.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Ilość: {offer.amount.toLocaleString("pl-PL")} {offer.unit}</p>
                </div>
                <div className="mt-auto flex items-end justify-between gap-2 border-t border-border/70 pt-3">
                  <div><p className="text-[10px] text-muted-foreground">Cena za całość</p><p className="num text-xl font-semibold text-primary">{(offer.amount * offer.price).toLocaleString("pl-PL")} KR</p></div>
                  <span className="text-xs font-medium text-primary">Szczegóły <span aria-hidden="true">→</span></span>
                </div>
              </button>
            ))}
          </div>
          {filtered.length === 0 ? <Panel className="p-8 text-center"><p className="font-semibold">Brak pasujących ofert</p><p className="mt-1 text-sm text-muted-foreground">Zmień wyszukiwanie lub kategorię.</p></Panel> : null}
        </>
      ) : (
        <div className="space-y-3">
          <SectionTitle>Twoje propozycje</SectionTitle>
          {proposals.map((proposal, index) => {
            const sellerResponded = proposal.lastOfferBy === "Sprzedający";
            const total = proposal.quantity * proposal.price;
            return (
              <Panel key={`${proposal.offerId}-${index}`} className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{proposal.offerTitle}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Państwo sprzedające: {proposal.country}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${proposal.status === "Kontroferta" ? "bg-amber-500/10 text-amber-600" : proposal.status === "Zaakceptowana" ? "bg-primary/10 text-primary" : proposal.status === "Odrzucona" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>{proposal.status}</span>
                </div>

                <div className={`rounded-lg border p-3 ${sellerResponded ? "border-amber-500/30 bg-amber-500/[0.06]" : "border-primary/20 bg-primary/[0.04]"}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Aktualna propozycja</p>
                  <p className="mt-1 text-sm font-semibold">{sellerResponded ? `${proposal.country} składa kontrofertę Tobie` : "Twoja propozycja wysłana do sprzedającego"}</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div><p className="text-[10px] text-muted-foreground">Ilość</p><p className="num font-semibold">{proposal.quantity.toLocaleString("pl-PL")}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Cena za jednostkę</p><p className="num font-semibold">{proposal.price.toLocaleString("pl-PL")} KR</p></div>
                  </div>
                  <div className="mt-3 border-t border-border/60 pt-2">
                    <p className="text-[10px] text-muted-foreground">Łączna kwota do zapłaty</p>
                    <p className="num text-2xl font-bold text-primary">{total.toLocaleString("pl-PL")} KR</p>
                  </div>
                </div>

                {proposal.status === "Zaakceptowana" || proposal.status === "Odrzucona" ? (
                  <p className="text-xs text-muted-foreground">{proposal.status === "Zaakceptowana" ? "Negocjacje zakończone — propozycja zaakceptowana." : "Negocjacje zakończone — propozycja odrzucona."}</p>
                ) : sellerResponded ? (
                  <>
                    <p className="text-xs font-medium text-amber-600">Potrzebna jest Twoja decyzja.</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Button size="sm" onClick={() => setProposals((current) => current.map((p, i) => i === index ? { ...p, status: "Zaakceptowana" } : p))}>Akceptuj kontrofertę</Button>
                      <Button size="sm" variant="outline" onClick={() => { setCounterIndex(index); setCounterPrice(String(proposal.price)); }}>Zaproponuj inną cenę</Button>
                      <Button size="sm" variant="ghost" onClick={() => setProposals((current) => current.map((p, i) => i === index ? { ...p, status: "Odrzucona" } : p))}>Odrzuć</Button>
                    </div>
                  </>
                ) : (
                  <p className="rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground"> <span className="font-semibold text-foreground">Teraz ruch sprzedającego.</span> Czekasz na akceptację lub kontrofertę od państwa {proposal.country}.</p>
                )}
              </Panel>
            );
          })}
          {proposals.length === 0 ? <Panel className="p-8 text-center text-sm text-muted-foreground">Nie masz jeszcze żadnych propozycji.</Panel> : null}
        </div>
      )}


      <Dialog open={!!detailsOffer} onOpenChange={(open) => !open && setDetailsOffer(null)}>
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle>{detailsOffer?.title ?? "Szczegóły oferty"}</DialogTitle>
            <DialogDescription>{detailsOffer ? `${detailsOffer.flag} ${detailsOffer.country} · ${detailsOffer.category}` : "Pełne informacje o ofercie."}</DialogDescription>
          </DialogHeader>
          {detailsOffer ? <div className="space-y-4">
            <div className="rounded-lg bg-secondary/40 p-3">
              <p className="text-xs text-muted-foreground">Cena za całość</p>
              <p className="num text-2xl font-bold text-primary">{(detailsOffer.amount * detailsOffer.price).toLocaleString("pl-PL")} KR</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-muted-foreground">Ilość</p><p className="num font-semibold">{detailsOffer.amount.toLocaleString("pl-PL")} {detailsOffer.unit}</p></div>
              <div><p className="text-xs text-muted-foreground">Cena jednostkowa</p><p className="num font-semibold">{detailsOffer.price.toLocaleString("pl-PL")} KR / {detailsOffer.unit}</p></div>
              <div><p className="text-xs text-muted-foreground">Kategoria</p><p className="font-semibold">{detailsOffer.category}</p></div>
              <div><p className="text-xs text-muted-foreground">Państwo sprzedające</p><p className="font-semibold">{detailsOffer.flag} {detailsOffer.country}</p></div>
              <div className="col-span-2"><p className="text-xs text-muted-foreground">Wystawiono</p><p className="font-semibold">{detailsOffer.days === 0 ? "Dzisiaj" : `${detailsOffer.days} dni temu`}</p></div>
            </div>
            <div><p className="mb-1 text-xs text-muted-foreground">Opis oferty</p><p className="text-sm leading-relaxed">{detailsOffer.description}</p></div>
            <Button className="w-full" onClick={() => { const offer = detailsOffer; setDetailsOffer(null); openProposal(offer); }}><MessageCircle className="mr-2 size-4" /> Zaproponuj cenę</Button>
          </div> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={counterIndex !== null} onOpenChange={(open) => !open && setCounterIndex(null)}>
        <DialogContent className="admin-dialog">
          <DialogHeader><DialogTitle>Zaproponuj cenę kontrującą</DialogTitle><DialogDescription>Zmień kwotę i wyślij kontrpropozycję. Bez wiadomości tekstowych.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">Nowa cena za sztukę (KR)</label>
            <Input type="number" min="1" value={counterPrice} onChange={(event) => setCounterPrice(event.target.value)} />
            {counterIndex !== null && proposals[counterIndex] ? <div className="rounded-lg bg-secondary/50 p-3"><p className="text-[10px] text-muted-foreground">Łączna wartość kontroferty</p><p className="num text-lg font-bold text-primary">{(proposals[counterIndex].quantity * Math.max(0, Number(counterPrice) || 0)).toLocaleString("pl-PL")} KR</p></div> : null}
            <Button className="w-full" onClick={submitCounterProposal} disabled={!Number.isFinite(Number(counterPrice)) || Number(counterPrice) <= 0}>Wyślij kontrofertę</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
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
