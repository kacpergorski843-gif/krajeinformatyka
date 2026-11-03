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

    const [targetAdmin, targetMainAdmin, actorMainAdmin] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: data.userId, _role: "ADMIN" }),
      context.supabase.rpc("has_role", { _user_id: data.userId, _role: "MAIN_ADMIN" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "MAIN_ADMIN" }),
    ]);
    if (targetAdmin.error || targetMainAdmin.error || actorMainAdmin.error) {
      throw new Error("Nie udało się zweryfikować uprawnień konta");
    }
    if ((targetAdmin.data === true || targetMainAdmin.data === true) && actorMainAdmin.data !== true) {
      throw new Error("Tylko główny administrator może usunąć konto administratora");
    }

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
 * Zmiana flagi własnego państwa. Plik jest przesyłany na serwer i zapisywany
 * przez service role, więc władca nie jest zależny od polityk Storage w kliencie.
 */
export const rulerUploadCountryFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    countryId: z.string().uuid(),
    fileBase64: z.string().min(1).max(8_000_000),
    contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
    extension: z.enum(["png", "jpg", "jpeg", "webp", "gif"]),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("country_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (profile?.country_id !== data.countryId) {
      throw new Error("Możesz zmienić flagę tylko swojego państwa");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = Buffer.from(data.fileBase64, "base64");
    if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) {
      throw new Error("Flaga może mieć maksymalnie 5 MB.");
    }

    const path = data.countryId + "/flag-" + Date.now() + "." + data.extension;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("country-flags")
      .upload(path, bytes, { upsert: true, contentType: data.contentType });
    if (uploadError) throw new Error("Upload flagi: " + uploadError.message);

    const { data: publicUrl } = supabaseAdmin.storage.from("country-flags").getPublicUrl(path);
    const { error: flagError } = await supabaseAdmin
      .from("countries")
      .update({ flag: publicUrl.publicUrl })
      .eq("id", data.countryId);
    if (flagError) throw new Error("Zapis flagi: " + flagError.message);

    return { ok: true };
  });

/** Odczyt globalnego i stronicowego trybu konserwacji dla zalogowanych użytkowników. */
export const getMaintenanceMode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("app_maintenance_mode")
      .select("enabled, pages, message_title, message_body")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      enabled: data?.enabled === true,
      pages: Array.isArray(data?.pages) ? data.pages as string[] : [],
      messageTitle: data?.message_title || "Ekonomia jest aktualnie w remoncie",
      messageBody: data?.message_body || "Szykuje się aktualizacja! Po więcej informacji skontaktuj się z informatykiem.",
    };
  });

/** Zmiana trybu konserwacji jest dostępna wyłącznie dla MAIN_ADMIN. */
export const setMaintenanceMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    enabled: z.boolean(),
    pages: z.array(z.string().min(1).max(32)).max(20).refine((pages) => {
      const allowed = new Set([
        "/panstwo", "/regiony", "/swiat", "/swiat/$id", "/ranking",
        "/sklep", "/arsenal", "/transfer", "/umowy",
      ]);
      return pages.every((page) => allowed.has(page));
    }),
    messageTitle: z.string().trim().min(1).max(120),
    messageBody: z.string().max(1000),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isMainAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "MAIN_ADMIN",
    });
    if (roleError) throw new Error(roleError.message);
    if (isMainAdmin !== true) throw new Error("Tylko główny administrator może zmienić tryb konserwacji");

    const { error } = await (context.supabase as any)
      .from("app_maintenance_mode")
      .upsert({
        id: 1,
        enabled: data.enabled,
        pages: data.pages,
        message_title: data.messageTitle,
        message_body: data.messageBody,
      }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return {
      enabled: data.enabled,
      pages: data.pages,
      messageTitle: data.messageTitle,
      messageBody: data.messageBody,
    };
  });
