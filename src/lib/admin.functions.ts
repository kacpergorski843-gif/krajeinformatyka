import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Trwałe usunięcie konta gracza: dane gry usuwa RPC administratora,
 * samo konto logowania usuwa Auth Admin API po stronie serwera.
 */
export const deletePlayerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    if (roleError) throw new Error(roleError.message);
    if (isAdmin !== true) throw new Error("Brak uprawnień administratora");
    if (data.userId === context.userId) throw new Error("Nie można usunąć własnego konta");

    const { error: purgeError } = await context.supabase.rpc("admin_purge_player", {
      p_user_id: data.userId,
    });
    if (purgeError) throw new Error(purgeError.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
/**
 * Ustawia nowe hasło wskazanemu użytkownikowi z poziomu panelu administratora.
 * Hasło trafia wyłącznie do Supabase Auth Admin API po stronie serwera.
 */
export const resetPlayerPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    userId: z.string().uuid(),
    password: z.string().min(8).max(128),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    if (roleError) throw new Error(roleError.message);
    if (isAdmin !== true) throw new Error("Brak uprawnień administratora");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });
