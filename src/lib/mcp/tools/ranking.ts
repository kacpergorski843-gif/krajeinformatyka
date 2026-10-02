import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_world_ranking",
  title: "Ranking państw",
  description: "Lista państw świata z dochodem i potencjałem głosów, posortowana malejąco.",
  inputSchema: {
    sort: z.enum(["income", "votes"]).default("income").describe("Kategoria rankingu."),
    limit: z.number().int().min(1).max(100).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sort, limit }, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("world_country_stats")
      .select("name,gross_income,vote_potential,regions_count")
      .order(sort === "votes" ? "vote_potential" : "gross_income", { ascending: false })
      .limit(limit);
    if (error) throw new ToolError(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
});
