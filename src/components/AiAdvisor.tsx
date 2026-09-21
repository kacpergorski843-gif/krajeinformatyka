import { useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { askAiAdvisor } from "@/lib/ai-advisor.server";
import { Panel } from "@/components/stat";

type Message = { role: "user" | "assistant"; content: string };

function AdvisorAnswer({ content }: { content: string }) {
  const lines = content.replace(/\*\*/g, "").replace(/\*/g, "").split("\n");

  return (
    <div className="space-y-2 leading-relaxed">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-1" />;
        if (/^#{1,3}\s+/.test(trimmed)) {
          return (
            <p key={index} className="pt-1 font-semibold text-primary">
              {trimmed.replace(/^#{1,3}\s+/, "")}
            </p>
          );
        }
        if (/^[-–—]\s+/.test(trimmed)) {
          return (
            <div key={index} className="flex gap-2 pl-1">
              <span className="text-primary">•</span>
              <span>{trimmed.replace(/^[-–—]\s+/, "")}</span>
            </div>
          );
        }
        if (/^---+$/.test(trimmed)) {
          return <div key={index} className="my-1 border-t border-border" />;
        }
        return <p key={index}>{trimmed}</p>;
      })}
    </div>
  );
}

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

      const result = await askAiAdvisor({
        data: { message, accessToken: session.access_token },
      });

      if (!result.answer) throw new Error("AI nie zwróciło odpowiedzi.");
      setMessages((current) => [...current, { role: "assistant", content: result.answer }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się połączyć z doradcą AI");
      setMessages((current) => current.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel className="border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-center gap-3">
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
        <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`rounded-sm border p-4 text-sm break-words ${message.role === "assistant" ? "border-primary/20 bg-background" : "ml-auto max-w-[90%] border-border bg-secondary/30 sm:max-w-[75%]"}`}
            >
              <p className="label-hud mb-2">{message.role === "assistant" ? "DORADCA AI" : "TY"}</p>
              {message.role === "assistant" ? <AdvisorAnswer content={message.content} /> : <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>}
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
