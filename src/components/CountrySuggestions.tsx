import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Flag, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/lib/api";
import { Panel, SectionTitle } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Suggestion = {
  id: string; user_id: string; name: string; note: string; status: string; created_at: string; reviewed_at: string | null;
  profiles: { username: string | null; display_name: string | null; email: string | null } | null;
};

const msg = (e: unknown) => (e instanceof Error ? e.message : "Nie udało się");

export function SuggestCountryPanel({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const { data: mine } = useQuery({
    queryKey: ["my_country_suggestions", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("country_suggestions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return data;
    },
  });
  const pending = mine?.find((s) => s.status === "PENDING");
  const lastRejected = !pending ? mine?.find((s) => s.status === "REJECTED") : undefined;
  const refresh = () => qc.invalidateQueries({ queryKey: ["my_country_suggestions"] });

  const submit = useMutation({
    mutationFn: () => rpc("suggest_country", { p_name: name.trim(), p_note: note.trim() }),
    onSuccess: () => { toast.success("Propozycja wysłana do administracji"); setName(""); setNote(""); void refresh(); },
    onError: (e) => toast.error(msg(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => rpc("cancel_country_suggestion", { p_id: id }),
    onSuccess: () => { toast.success("Propozycja wycofana"); void refresh(); },
    onError: (e) => toast.error(msg(e)),
  });

  return (
    <Panel className="mt-3 p-4">
      <p className="text-sm font-semibold">Zaproponuj swoje państwo</p>
      {pending ? (
        <div className="mt-3 space-y-3">
          <p className="text-muted-foreground text-sm">Twoja propozycja czeka na decyzję administracji:</p>
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Oczekuje</Badge><span className="font-semibold">{pending.name}</span></div>
          <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(pending.id)}>Wycofaj propozycję</Button>
        </div>
      ) : (
        <form className="mt-3 grid gap-3" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
          {lastRejected ? <p className="text-destructive text-sm">Propozycja „{lastRejected.name}” została odrzucona. Możesz zaproponować inną.</p> : null}
          <div className="grid gap-1.5"><Label htmlFor="sg-name">Nazwa państwa</Label>
            <Input id="sg-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="np. Republika Bałtycka" /></div>
          <div className="grid gap-1.5"><Label htmlFor="sg-note">Wiadomość dla administracji (opcjonalnie)</Label>
            <Input id="sg-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Krótki opis lub uzasadnienie" /></div>
          <Button type="submit" className="w-full sm:w-auto" disabled={submit.isPending || name.trim().length < 2}>Wyślij propozycję</Button>
        </form>
      )}
    </Panel>
  );
}

export function AdminSuggestionsTab() {
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [confirm, setConfirm] = useState<{ s: Suggestion; accept: boolean } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin_country_suggestions", showAll],
    queryFn: async () => {
      let q = supabase.from("country_suggestions").select("*, profiles(username, display_name, email)").order("created_at", { ascending: false }).limit(200);
      if (!showAll) q = q.eq("status", "PENDING");
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Suggestion[];
    },
  });
  const review = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => rpc("admin_review_country_suggestion", { p_id: id, p_accept: accept }),
    onSuccess: (_d, v) => { toast.success(v.accept ? "Państwo utworzone i przypisane" : "Propozycja odrzucona"); setConfirm(null); void qc.invalidateQueries(); },
    onError: (e) => toast.error(msg(e)),
  });
  const who = (s: Suggestion) => s.profiles?.username ?? s.profiles?.display_name ?? s.profiles?.email ?? s.user_id.slice(0, 8);

  return (
    <Panel className="min-w-0 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>Propozycje państw</SectionTitle>
        <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>{showAll ? "Tylko oczekujące" : "Pokaż wszystkie"}</Button>
      </div>
      {isLoading ? <p className="text-muted-foreground mt-4 text-sm">Ładowanie…</p> :
        !data?.length ? <p className="text-muted-foreground mt-4 text-sm">Brak propozycji.</p> : (
        <div className="mt-4 grid gap-3">
          {data.map((s) => (
            <div key={s.id} className="border-border/70 bg-card/60 flex min-w-0 flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center">
              <Flag className="text-primary size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.name}</p>
                <p className="text-muted-foreground text-xs">Gracz: <span className="text-foreground">{who(s)}</span> · {new Date(s.created_at).toLocaleString("pl-PL")}</p>
                {s.note ? <p className="text-muted-foreground mt-1 text-sm break-words">„{s.note}”</p> : null}
              </div>
              {s.status === "PENDING" ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setConfirm({ s, accept: true })}><Check className="size-4" /> Akceptuj</Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirm({ s, accept: false })}><X className="size-4" /> Odrzuć</Button>
                </div>
              ) : <Badge variant={s.status === "ACCEPTED" ? "default" : "outline"}>{s.status === "ACCEPTED" ? "Zaakceptowana" : "Odrzucona"}</Badge>}
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle>{confirm?.accept ? "Zaakceptować propozycję?" : "Odrzucić propozycję?"}</DialogTitle>
            <DialogDescription>
              {confirm?.accept
                ? `Zostanie utworzone państwo „${confirm.s.name}” ze startowym skarbcem i regionem, przypisane do gracza ${who(confirm.s)}.`
                : `Gracz ${confirm ? who(confirm.s) : ""} będzie mógł zaproponować inną nazwę.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirm(null)}>Anuluj</Button>
            <Button className="flex-1" variant={confirm?.accept ? "default" : "destructive"} disabled={review.isPending}
              onClick={() => confirm && review.mutate({ id: confirm.s.id, accept: confirm.accept })}>Zatwierdź</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
