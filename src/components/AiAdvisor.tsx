import { useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat";

type Message = { role: "user" | "assistant"; content: string };

const starters = [
  "Przeanalizuj moje państwo i wskaż najważniejsze problemy.",
  "Czy teraz lepiej inwestować w gospodarkę czy obronę?",
  "Co powinienem zrobić z obecnymi KR?",
];

export function AiAdvisor() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(text = input) {
    const message = text.trim();
    if (!message || loading) return;
    setInput("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Sesja wygasła. Zaloguj się ponownie.");
      }

      const supabaseUrl =
        import.meta.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
      const supabaseKey =
        import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
        process.env["SUPABASE_PUBLISHABLE_KEY"];

      if (!supabaseUrl || !supabaseKey) {
        throw new Error("Brak konfiguracji połączenia z backendem.");
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/ai-advisor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message }),
      });

      const raw = await response.text();
      let data: { answer?: string; error?: string } = {};
      try {
        data = JSON.parse(raw);
      } catch {
        // Keep the raw HTTP status below when the backend returns non-JSON.
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Doradca AI zwrócił błąd HTTP ${response.status}. Spróbuj ponownie za chwilę.`,
        );
      }

      if (!data.answer) throw new Error(data.error || "AI nie zwróciło odpowiedzi.");
      setMessages((current) => [...current, { role: "assistant", content: data.answer! }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się połączyć z doradcą AI");
      setMessages((current) => current.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel className="mb-4 border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-sm border border-primary/30 bg-primary/10">
          <Bot className="size-5 text-primary" />
        </div>
        <div>
          <p className="label-hud">DORADCA AI</p>
          <p className="text-xs text-muted-foreground">Analizuje Twoje państwo, historię i zasady gry</p>
        </div>
        <Sparkles className="ml-auto size-4 text-primary" />
      </div>

      {messages.length === 0 ? (
        <div className="mt-3 grid gap-2">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => ask(starter)}
              className="border border-border bg-background/60 px-3 py-2 text-left text-xs transition hover:border-primary/50"
            >
              {starter}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`whitespace-pre-wrap rounded-sm border p-3 text-sm ${message.role === "assistant" ? "border-primary/20 bg-background" : "border-border bg-secondary/30"}`}
            >
              <p className="label-hud mb-1">{message.role === "assistant" ? "DORADCA" : "TY"}</p>
              {message.content}
            </div>
          ))}
          {loading ? <div className="text-xs text-muted-foreground">Doradca analizuje sytuację...</div> : null}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={2000}
          placeholder="Zapytaj o swoją strategię..."
          className="min-w-0 flex-1 border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
          aria-label="Wyślij pytanie do doradcy AI"
        >
          <Send className="size-4" />
        </button>
      </form>
    </Panel>
  );
}
