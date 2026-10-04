import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_world_ranking",
  title: "Ranking państw",
  description: "Lista państw świata z produkcją KR, głosami wojennymi i wartością militarną.",
  inputSchema: {
    sort: z.enum(["income", "votes", "military"]).default("income").describe("Kategoria sortowania rankingu."),
    limit: z.number().int().min(1).max(100).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sort, limit }, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("world_country_stats")
      .select("name,gross_income,war_votes,military_value,regions_count")
      .order(sort === "votes" ? "war_votes" : sort === "military" ? "military_value" : "gross_income", { ascending: false })
      .limit(limit);
    if (error) throw new ToolError(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
});
