import { auth, defineMcp } from "@lovable.dev/mcp-js";
import myCountry from "./tools/my-country";
import ranking from "./tools/ranking";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "nation-dynamics",
  title: "Nation Dynamics",
  version: "0.1.0",
  instructions:
    "Narzędzia gry Nation Dynamics (roleplay państwowy). `get_my_country` zwraca stan państwa gracza, `get_world_ranking` ranking świata.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [myCountry, ranking],
});
