const NBSP = "\u202F";

export function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

/** 1500000000000 -> "1 500 000 000 000" */
export function groupDigits(v: string | number | null | undefined): string {
  const raw = String(v ?? 0);
  const neg = raw.trim().startsWith("-");
  const digits = raw.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
  const grouped = (digits || "0").replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (neg ? "-" : "") + grouped;
}

export function kr(v: string | number | null | undefined): string {
  return `${groupDigits(v)}${NBSP}KR`;
}

const SCALES: { limit: number; unit: string }[] = [
  { limit: 1e12, unit: "bln" },
  { limit: 1e9, unit: "mld" },
  { limit: 1e6, unit: "mln" },
  { limit: 1e3, unit: "tys." },
];

/** Globalny skrót liczby: 1,5 bln / 250 mld / 12,4 tys. */
export function fmtNum(v: string | number | null | undefined): string {
  const n = toNum(v);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  for (const s of SCALES) {
    if (abs >= s.limit) {
      const x = abs / s.limit;
      const str = (x >= 100 || x % 1 === 0 ? x.toFixed(0) : x.toFixed(1)).replace(".", ",");
      return `${sign}${str}${NBSP}${s.unit}`;
    }
  }
  return groupDigits(n);
}

/** Globalny skrót kwoty: 1,5 bln KR */
export function fmtKR(v: string | number | null | undefined): string {
  return `${fmtNum(v)}${NBSP}KR`;
}

/** Alias historyczny */
export function krShort(v: string | number | null | undefined): string {
  return fmtKR(v);
}

export function units(v: string | number | null | undefined): string {
  return groupDigits(v);
}

export const BUILDING_LABELS: Record<string, string> = {
  factory_1: "Fabryka I",
  factory_2: "Fabryka II",
  factory_3: "Fabryka III",
  factory_4: "Fabryka IV",
  factory_5: "Fabryka V",
  mine_coal: "Wytwórnia węgla",
  mine_oil: "Wytwórnia ropy",
  mine_copper: "Wytwórnia miedzi",
  mine_iron: "Wytwórnia żelaza",
  mine_uranium: "Wytwórnia uranu",
  fort_1: "Fortyfikacja I",
  fort_2: "Fortyfikacja II",
  fort_3: "Fortyfikacja III",
};

export const RESOURCE_LABELS: Record<string, string> = {
  coal: "Węgiel",
  oil: "Ropa",
  copper: "Miedź",
  iron: "Żelazo",
  uranium: "Uran",
};

export const MISSILE_LABELS: Record<string, string> = {
  missile_1: "Rakieta I",
  missile_2: "Rakieta II",
  missile_3: "Rakieta III",
};

export const ROLE_LABELS: Record<string, string> = {
  PLAYER: "Gracz",
  ADMIN: "Administrator",
  MAIN_ADMIN: "Główny administrator",
};

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Ile zostało do najbliższej 20:00 czasu warszawskiego, jako "04:12:33" */
export function timeToDailyCycle(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const secondsNow = get("hour") * 3600 + get("minute") * 60 + get("second");
  const target = 20 * 3600;
  let diff = target - secondsNow;
  if (diff <= 0) diff += 24 * 3600;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return [h, m, s].map((x) => String(x).padStart(2, "0")).join(":");
}
