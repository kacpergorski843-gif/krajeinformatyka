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

/** Skrót: 1,5 bln KR */
export function krShort(v: string | number | null | undefined): string {
  const n = toNum(v);
  const abs = Math.abs(n);
  const fmt = (x: number, unit: string) => {
    const s = (x % 1 === 0 ? x.toFixed(0) : x.toFixed(1)).replace(".", ",");
    return `${n < 0 ? "-" : ""}${s}${NBSP}${unit}${NBSP}KR`;
  };
  if (abs >= 1e12) return fmt(abs / 1e12, "bln");
  if (abs >= 1e9) return fmt(abs / 1e9, "mld");
  if (abs >= 1e6) return fmt(abs / 1e6, "mln");
  return kr(n);
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
