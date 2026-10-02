import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_country",
  title: "Moje państwo",
  description: "Zwraca stan państwa zalogowanego gracza: skarbiec, surowce, wojsko, dochód i głosy.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data: profile } = await sb.from("profiles").select("country_id").eq("id", ctx.getUserId()!).maybeSingle();
    if (!profile?.country_id) throw new ToolError("Nie masz przypisanego państwa.");
    const { data, error } = await sb.from("country_stats").select("*").eq("country_id", profile.country_id).maybeSingle();
    if (error) throw new ToolError(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
});
