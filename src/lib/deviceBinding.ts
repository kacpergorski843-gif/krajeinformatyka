import type { SupabaseClient } from "@supabase/supabase-js";

const DEVICE_STORAGE_KEY = "nation-dynamics-device-id";

function getOrCreateDeviceId(): string {
  let deviceId: string | null;
  try {
    deviceId = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!deviceId) {
      deviceId = window.crypto.randomUUID();
      window.localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
    }
  } catch {
    throw new Error("Nie można zapisać identyfikatora urządzenia. Włącz pamięć witryny w przeglądarce i spróbuj ponownie.");
  }
  return deviceId;
}

/**
 * Claims this browser installation for the authenticated account.
 * The database is authoritative; localStorage only supplies a stable installation key.
 */
export async function claimCurrentDevice(supabase: SupabaseClient): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("claim_device", {
      p_device_id: getOrCreateDeviceId(),
    });
    if (error) throw error;
    if (data !== true) {
      throw new Error("To urządzenie jest już przypisane do innego konta. Na jednym urządzeniu można korzystać tylko z jednego konta.");
    }
  } catch (error) {
    await supabase.auth.signOut();
    throw error instanceof Error ? error : new Error("Nie udało się zweryfikować przypisania urządzenia.");
  }
}
