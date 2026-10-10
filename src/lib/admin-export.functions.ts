import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EXPORT_TABLES = [
  "profiles",
  "user_roles",
  "countries",
  "regions",
  "region_slots",
  "transactions",
  "admin_actions",
  "shop_items",
  "economy_runs",
  "economy_bonuses",
  "missile_strikes",
  "region_occupations",
  "ai_advisor_conversations",
] as const;

type ExportTable = (typeof EXPORT_TABLES)[number];

type ExportResult = {
  generated_at: string;
  tables: Record<string, unknown[]>;
  errors: { table: string; message: string }[];
  auth_users: unknown[];
};

async function readAllRows(table: ExportTable): Promise<{ rows: unknown[]; error?: string }> {
  // The Supabase REST API can cap individual responses, so page through each
  // table instead of silently exporting only the first page.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const rows: unknown[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .range(offset, offset + pageSize - 1);

    if (error) return { rows, error: error.message };
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return { rows };
}

async function readAllAuthUsers() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const users: unknown[] = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const pageUsers = data.users.map((user) => ({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      created_at: user.created_at,
      updated_at: user.updated_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      email_confirmed_at: user.email_confirmed_at ?? null,
      banned_until: user.banned_until ?? null,
      role: user.role ?? null,
    }));

    users.push(...pageUsers);
    if (pageUsers.length < perPage) break;
  }

  return users;
}

export const exportApplicationData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });

    if (roleError) throw new Error(roleError.message);
    if (isAdmin !== true) throw new Error("Brak uprawnień administratora");

    const { data: isMainAdmin, error: mainAdminError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "MAIN_ADMIN",
    });
    if (mainAdminError) throw new Error(mainAdminError.message);
    if (isMainAdmin !== true) {
      throw new Error("Pełny eksport danych jest dostępny wyłącznie dla głównego administratora");
    }

    const tables: Record<string, unknown[]> = {};
    const errors: { table: string; message: string }[] = [];

    for (const table of EXPORT_TABLES) {
      const result = await readAllRows(table);
      tables[table] = result.rows;
      if (result.error) errors.push({ table, message: result.error });
    }

    let auth_users: unknown[] = [];
    try {
      auth_users = await readAllAuthUsers();
    } catch (error) {
      errors.push({
        table: "auth.users",
        message: error instanceof Error ? error.message : "Nie udało się pobrać użytkowników Auth",
      });
    }

    const result: ExportResult = {
      generated_at: new Date().toISOString(),
      tables,
      errors,
      auth_users,
    };
    return JSON.stringify(result);
  });
