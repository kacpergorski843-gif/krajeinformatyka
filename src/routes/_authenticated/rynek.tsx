import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Handshake, Package, Plus, Search, Tag, X, ChartNoAxesCombined } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Panel, SectionTitle } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { meQuery, marketOffersQuery, marketMyOffersQuery, marketNegotiationsQuery, marketSalesQuery, marketRpc, type MarketOffer, type MarketResource } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/rynek")({
  head: () => ({ meta: [{ title: "Rynek — Nation Dynamics" }, { name: "description", content: "Handel między państwami" }] }),
  component: MarketPage,
});

const ITEMS: { value: MarketResource; label: string; category: "Surowce" | "Uzbrojenie"; unit: string }[] = [
  { value: "coal", label: "Węgiel", category: "Surowce", unit: "szt." },
  { value: "oil", label: "Ropa naftowa", category: "Surowce", unit: "szt." },
  { value: "copper", label: "Miedź", category: "Surowce", unit: "szt." },
  { value: "iron", label: "Żelazo", category: "Surowce", unit: "szt." },
  { value: "uranium", label: "Uran", category: "Surowce", unit: "szt." },
  { value: "soldier_packs", label: "Zestawy żołnierzy", category: "Uzbrojenie", unit: "zest." },
  { value: "tank_packs", label: "Zestawy czołgów", category: "Uzbrojenie", unit: "zest." },
  { value: "missile_1", label: "Rakiety I", category: "Uzbrojenie", unit: "szt." },
  { value: "missile_2", label: "Rakiety II", category: "Uzbrojenie", unit: "szt." },
  { value: "missile_3", label: "Rakiety III", category: "Uzbrojenie", unit: "szt." },
];
type Tab = "offers" | "mine" | "negotiations" | "history" | "prices";
const fmt = (value: string | number | bigint) => {
  try { return BigInt(value).toLocaleString("pl-PL"); } catch { return "0"; }
};
const total = (a: string, b: string) => (BigInt(a) * BigInt(b)).toString();
const validInt = (value: string) => /^[1-9]\\d*$/.test(value);
const itemLabel = (resource: string) => ITEMS.find(item => item.value === resource)?.label ?? resource;

function MarketPage() {
  const { data: me } = useQuery(meQuery);
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("offers");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Wszystkie");
  const [sort, setSort] = useState("price");
  const [selected, setSelected] = useState<MarketOffer | null>(null);
  const [buyQuantity, setBuyQuantity] = useState("1");
  const [proposalQuantity, setProposalQuantity] = useState("1");
  const [proposalPrice, setProposalPrice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [resource, setResource] = useState<MarketResource>("oil");
  const [newQuantity, setNewQuantity] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [editOffer, setEditOffer] = useState<MarketOffer | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [counter, setCounter] = useState<{id:string; quantity:string; price:string} | null>(null);

  const offers = useQuery({ ...marketOffersQuery, refetchInterval: 20000 });
  const mine = useQuery(marketMyOffersQuery(me?.countryId));
  const negotiations = useQuery({ ...marketNegotiationsQuery, refetchInterval: 20000 });
  const sales = useQuery(marketSalesQuery);
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["market"] }),
      client.invalidateQueries({ queryKey: ["country_stats"] }),
      client.invalidateQueries({ queryKey: ["me"] }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: ({ name, args }: { name: string; args: Record<string, unknown> }) => marketRpc(name, args),
    onSuccess: async () => { await refresh(); toast.success("Operacja zakończona."); setSelected(null); setCreateOpen(false); setEditOffer(null); setCounter(null); },
    onError: (error: Error) => toast.error(error.message || "Operacja nie powiodła się."),
  });
  const run = (name: string, args: Record<string, unknown>) => mutation.mutate({ name, args });
  const visibleOffers = useMemo(() => (offers.data ?? [])
    .filter(o => o.seller_country_id !== me?.countryId)
    .filter(o => category === "Wszystkie" || ITEMS.find(i => i.value === o.resource)?.category === category)
    .filter(o => (itemLabel(o.resource) + " " + (o.seller?.name ?? "")).toLocaleLowerCase("pl-PL").includes(search.trim().toLocaleLowerCase("pl-PL")))
    .sort((a,b) => sort === "price" ? BigInt(a.unit_price) < BigInt(b.unit_price) ? -1 : BigInt(a.unit_price) > BigInt(b.unit_price) ? 1 : a.created_at.localeCompare(b.created_at) : sort === "newest" ? b.created_at.localeCompare(a.created_at) : BigInt(a.quantity_remaining) > BigInt(b.quantity_remaining) ? -1 : BigInt(a.quantity_remaining) < BigInt(b.quantity_remaining) ? 1 : 0),
  [offers.data, me?.countryId, category, search, sort]);

  const tabs: {id:Tab; label:string; icon:typeof Package}[] = [
    {id:"offers",label:"Oferty",icon:Package},{id:"mine",label:"Moje oferty",icon:Tag},{id:"negotiations",label:"Negocjacje",icon:Handshake},{id:"history",label:"Historia",icon:ArrowDownUp},{id:"prices",label:"Ceny",icon:ChartNoAxesCombined},
  ];
  const create = () => {
    if (!validInt(newQuantity) || !validInt(newPrice)) return toast.error("Podaj dodatnią ilość i cenę, bez części dziesiętnych.");
    run("market_create_offer", {p_resource:resource,p_quantity:newQuantity,p_unit_price:newPrice});
  };
  const buy = () => {
    if (!selected || !validInt(buyQuantity) || BigInt(buyQuantity)>BigInt(selected.quantity_remaining)) return toast.error("Nieprawidłowa ilość.");
    run("market_buy", {p_offer_id:selected.id,p_quantity:buyQuantity});
  };
  const propose = () => {
    if (!selected || !validInt(proposalQuantity) || !validInt(proposalPrice) || BigInt(proposalQuantity)>BigInt(selected.quantity_remaining)) return toast.error("Sprawdź ilość i cenę propozycji.");
    run("market_propose", {p_offer_id:selected.id,p_quantity:proposalQuantity,p_unit_price:proposalPrice});
  };
  const respond = (id:string, action:string, quantity?:string, price?:string) => run("market_respond_negotiation", {p_negotiation_id:id,p_action:action,p_quantity:quantity ?? null,p_unit_price:price ?? null});

  return <AppShell me={me ?? null} title="Rynek">
    <Panel className="mb-4 space-y-1 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold"><Tag className="size-4 text-primary"/> Rynek państw</p>
      <p className="text-xs text-muted-foreground">0% prowizji · oferty ważne 7 dni · maksymalnie 10 aktywnych ofert na państwo. Wystawione towary są rezerwowane do sprzedaży, anulowania lub wygaśnięcia. Handel działa również podczas wojny.</p>
    </Panel>
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {tabs.map(t => <button key={t.id} type="button" onClick={()=>setTab(t.id)} className={`rounded-lg border px-2 py-3 text-xs font-semibold ${tab===t.id?"border-primary bg-primary/10 text-primary":"border-border bg-card text-muted-foreground"}`}><span className="flex items-center justify-center gap-2"><t.icon className="size-4"/>{t.label}</span></button>)}
    </div>

    {tab==="offers" && <div className="space-y-3">
      <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Szukaj towaru lub państwa..." className="pl-9 pr-9"/>{search && <button onClick={()=>setSearch("")} aria-label="Wyczyść"><X className="absolute right-3 top-1/2 size-4 -translate-y-1/2"/></button>}</div>
      <div className="flex gap-2 overflow-x-auto">{["Wszystkie","Surowce","Uzbrojenie"].map(v=><button key={v} onClick={()=>setCategory(v)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${category===v?"border-primary bg-primary/10 text-primary":"border-border text-muted-foreground"}`}>{v}</button>)}</div>
      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{visibleOffers.length} ofert</span><select value={sort} onChange={e=>setSort(e.target.value)} className="rounded-md border border-border bg-card px-2 py-2 text-xs"><option value="price">Najniższa cena</option><option value="newest">Najnowsze</option><option value="amount">Największa ilość</option></select></div>
      {offers.isLoading ? <Panel className="p-8 text-center text-sm text-muted-foreground">Ładowanie ofert…</Panel> : offers.isError ? <Panel className="p-5 text-sm text-destructive">Nie udało się pobrać ofert. Sprawdź, czy migracja rynku została wdrożona.</Panel> : visibleOffers.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleOffers.map(o=><button key={o.id} onClick={()=>{setSelected(o);setBuyQuantity("1");setProposalQuantity("1");setProposalPrice(o.unit_price);}} className="panel flex min-w-0 flex-col gap-3 p-4 text-left hover:border-primary/50"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-secondary px-2 py-1 text-[10px]">{ITEMS.find(i=>i.value===o.resource)?.category}</span><span className="text-xs text-muted-foreground">{o.seller?.flag ?? "🏳️"} {o.seller?.name ?? "Państwo"}</span></div><div><h3 className="font-semibold">{itemLabel(o.resource)}</h3><p className="mt-1 text-xs text-muted-foreground">Dostępne: {fmt(o.quantity_remaining)}</p></div><div className="border-t border-border pt-3"><p className="num text-xl font-bold text-primary">{fmt(o.unit_price)} KR <span className="text-xs font-normal text-muted-foreground">/ jednostkę</span></p><p className="text-xs text-muted-foreground">Całość: {fmt(total(o.quantity_remaining,o.unit_price))} KR</p></div></button>)}</div> : <Panel className="p-8 text-center text-sm text-muted-foreground">Brak aktywnych ofert. Wystaw własną w zakładce „Moje oferty”.</Panel>}
    </div>}

    {tab==="mine" && <div className="space-y-3">
      <div className="flex items-center justify-between"><SectionTitle>Moje oferty</SectionTitle><Button size="sm" onClick={()=>setCreateOpen(v=>!v)}><Plus className="mr-1 size-4"/>Wystaw</Button></div>
      {createOpen && <Panel className="space-y-3 p-4"><h3 className="font-semibold">Nowa oferta</h3><label className="block text-xs text-muted-foreground">Towar<select value={resource} onChange={e=>setResource(e.target.value as MarketResource)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground">{ITEMS.map(i=><option key={i.value} value={i.value}>{i.label}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-xs text-muted-foreground">Ilość<Input inputMode="numeric" value={newQuantity} onChange={e=>setNewQuantity(e.target.value)} placeholder="np. 100"/></label><label className="text-xs text-muted-foreground">Cena za jednostkę (KR)<Input inputMode="numeric" value={newPrice} onChange={e=>setNewPrice(e.target.value)} placeholder="np. 25"/></label></div><p className="text-xs text-muted-foreground">Wartość: {validInt(newQuantity)&&validInt(newPrice)?fmt(total(newQuantity,newPrice)):"—"} KR. Zasób zostanie odjęty z magazynu przy wystawieniu.</p><div className="flex gap-2"><Button disabled={mutation.isPending} onClick={create}>Wystaw ofertę</Button><Button variant="outline" onClick={()=>setCreateOpen(false)}>Anuluj</Button></div></Panel>}
      {mine.isLoading ? <Panel className="p-6 text-sm text-muted-foreground">Ładowanie…</Panel> : (mine.data??[]).map(o=><Panel key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{itemLabel(o.resource)}</p><p className="text-xs text-muted-foreground">Pozostało {fmt(o.quantity_remaining)} · {fmt(o.unit_price)} KR/jedn. · wygasa {new Date(o.expires_at).toLocaleDateString("pl-PL")}</p><p className="text-[10px] text-muted-foreground">{o.status==="ACTIVE"?"Aktywna":o.status==="SOLD"?"Sprzedana":o.status==="CANCELLED"?"Anulowana":"Wygasła"}</p></div>{o.status==="ACTIVE" && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>{setEditOffer(o);setEditPrice(o.unit_price);}}>Cena</Button><Button size="sm" variant="ghost" onClick={()=>run("market_cancel_offer",{p_offer_id:o.id})}>Anuluj</Button></div>}</Panel>)}
      {!mine.isLoading&&!mine.data?.length&&<Panel className="p-8 text-center text-sm text-muted-foreground">Nie masz jeszcze ofert.</Panel>}
      {editOffer && <Panel className="space-y-3 p-4"><h3 className="font-semibold">Zmień cenę — {itemLabel(editOffer.resource)}</h3><Input inputMode="numeric" value={editPrice} onChange={e=>setEditPrice(e.target.value)}/><p className="text-xs text-muted-foreground">Termin wygaśnięcia pozostaje bez zmian.</p><div className="flex gap-2"><Button disabled={!validInt(editPrice)} onClick={()=>run("market_update_offer_price",{p_offer_id:editOffer.id,p_unit_price:editPrice})}>Zapisz cenę</Button><Button variant="outline" onClick={()=>setEditOffer(null)}>Wróć</Button></div></Panel>}
    </div>}

    {tab==="negotiations" && <div className="space-y-3"><SectionTitle>Negocjacje</SectionTitle>{(negotiations.data??[]).map(n=>{
      const offer=(offers.data??[]).find(o=>o.id===n.offer_id) ?? (mine.data??[]).find(o=>o.id===n.offer_id);
      const seller=offer?.seller_country_id===me?.countryId;
      const buyer=n.buyer_country_id===me?.countryId;
      return <Panel key={n.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{itemLabel(offer?.resource??"")}</p><p className="text-xs text-muted-foreground">{fmt(n.quantity)} szt. · {fmt(n.unit_price)} KR/jedn. · razem {fmt(total(n.quantity,n.unit_price))} KR</p><p className="text-[10px] text-muted-foreground">{n.last_offer_by==="BUYER"?"Ostatnia propozycja kupującego":"Ostatnia kontroferta sprzedającego"}</p></div><span className="rounded-full bg-secondary px-2 py-1 text-[10px]">Oczekuje</span></div>
      {seller&&n.last_offer_by==="BUYER"&&<div className="flex flex-wrap gap-2"><Button size="sm" onClick={()=>respond(n.id,"ACCEPT")}>Akceptuj</Button><Button size="sm" variant="outline" onClick={()=>setCounter({id:n.id,quantity:n.quantity,price:n.unit_price})}>Kontroferta</Button><Button size="sm" variant="ghost" onClick={()=>respond(n.id,"REJECT")}>Odrzuć</Button></div>}
      {buyer&&n.last_offer_by==="SELLER"&&<div className="flex gap-2"><Button size="sm" onClick={()=>respond(n.id,"ACCEPT_COUNTER")}>Akceptuj kontrofertę</Button><Button size="sm" variant="ghost" onClick={()=>respond(n.id,"REJECT")}>Odrzuć</Button></div>}
      {((buyer&&n.last_offer_by==="BUYER")||(seller&&n.last_offer_by==="SELLER"))&&<p className="text-xs text-muted-foreground">Czekasz na odpowiedź drugiej strony.</p>}
      {counter?.id===n.id&&<div className="space-y-2 rounded-lg border border-border p-3"><label className="block text-xs text-muted-foreground">Ilość<Input inputMode="numeric" value={counter.quantity} onChange={e=>setCounter({...counter,quantity:e.target.value})}/></label><label className="block text-xs text-muted-foreground">Cena za jednostkę (KR)<Input inputMode="numeric" value={counter.price} onChange={e=>setCounter({...counter,price:e.target.value})}/></label><div className="flex gap-2"><Button size="sm" disabled={!validInt(counter.quantity)||!validInt(counter.price)} onClick={()=>respond(n.id,"COUNTER",counter.quantity,counter.price)}>Wyślij kontrofertę</Button><Button size="sm" variant="outline" onClick={()=>setCounter(null)}>Anuluj</Button></div></div>}
      </Panel>;
    })}{!negotiations.isLoading&&!negotiations.data?.length&&<Panel className="p-8 text-center text-sm text-muted-foreground">Brak aktywnych negocjacji.</Panel>}</div>}

    {tab==="history" && <div className="space-y-3"><SectionTitle>Historia transakcji</SectionTitle>{(sales.data??[]).map(s=><Panel key={s.id} className="flex items-center justify-between gap-3 p-4"><div><p className="font-semibold">{itemLabel(s.resource)}</p><p className="text-xs text-muted-foreground">{fmt(s.quantity)} szt. · {fmt(s.unit_price)} KR/jedn. · {new Date(s.created_at).toLocaleString("pl-PL")}</p></div><div className="text-right"><p className="num font-semibold">{fmt(s.total_price)} KR</p><p className="text-[10px] text-muted-foreground">{s.buyer_country_id===me?.countryId?"Zakup":"Sprzedaż"}</p></div></Panel>)}{!sales.isLoading&&!sales.data?.length&&<Panel className="p-8 text-center text-sm text-muted-foreground">Brak transakcji.</Panel>}</div>}

    {tab==="prices" && <div className="space-y-3"><SectionTitle>Ceny transakcyjne</SectionTitle><p className="text-xs text-muted-foreground">Rzeczywiste ceny z zakończonych transakcji rynku.</p>{ITEMS.map(item=>{const rows=(sales.data??[]).filter(s=>s.resource===item.value).slice(0,20);return rows.length?<Panel key={item.value} className="space-y-2 p-4"><h3 className="font-semibold">{item.label}</h3><div className="flex flex-wrap gap-2">{rows.slice(0,6).map(s=><span key={s.id} className="rounded-md bg-secondary px-2 py-1 text-xs">{fmt(s.unit_price)} KR · {new Date(s.created_at).toLocaleDateString("pl-PL")}</span>)}</div><p className="text-[10px] text-muted-foreground">{rows.length} ostatnich transakcji dostępnych w historii</p></Panel>:null})}{!sales.isLoading&&!(sales.data??[]).length&&<Panel className="p-8 text-center text-sm text-muted-foreground">Ceny pojawią się po pierwszych transakcjach.</Panel>}</div>}

    {selected&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={()=>setSelected(null)}><div role="dialog" aria-modal="true" className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-5 shadow-xl" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">{itemLabel(selected.resource)}</h2><p className="text-xs text-muted-foreground">{selected.seller?.flag} {selected.seller?.name}</p></div><button onClick={()=>setSelected(null)} aria-label="Zamknij">✕</button></div><p className="num text-2xl font-bold text-primary">{fmt(selected.unit_price)} KR / jednostkę</p><p className="text-xs text-muted-foreground">Dostępne: {fmt(selected.quantity_remaining)}</p><div className="space-y-2"><label className="block text-xs text-muted-foreground">Ilość do zakupu<Input inputMode="numeric" value={buyQuantity} onChange={e=>setBuyQuantity(e.target.value)}/></label><p className="font-semibold">Do zapłaty: {validInt(buyQuantity)?fmt(total(buyQuantity,selected.unit_price)):"—"} KR</p><Button className="w-full" disabled={mutation.isPending||!validInt(buyQuantity)||BigInt(validInt(buyQuantity)?buyQuantity:"0")>BigInt(selected.quantity_remaining)} onClick={buy}>Kup teraz</Button></div><div className="space-y-2 border-t border-border pt-3"><h3 className="font-semibold">Zaproponuj cenę</h3><label className="block text-xs text-muted-foreground">Ilość<Input inputMode="numeric" value={proposalQuantity} onChange={e=>setProposalQuantity(e.target.value)}/></label><label className="block text-xs text-muted-foreground">Cena za jednostkę (KR)<Input inputMode="numeric" value={proposalPrice} onChange={e=>setProposalPrice(e.target.value)}/></label><Button className="w-full" variant="outline" disabled={mutation.isPending||!validInt(proposalQuantity)||!validInt(proposalPrice)||BigInt(validInt(proposalQuantity)?proposalQuantity:"0")>BigInt(selected.quantity_remaining)} onClick={propose}>Wyślij propozycję</Button></div></div></div>}
  </AppShell>;
}
