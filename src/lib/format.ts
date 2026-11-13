const NBSP = "\u202F";

/** Converts integer strings (including scientific notation from PostgREST) to BigInt exactly. */
export function toBigInt(v: string | number | bigint | null | undefined): bigint {
  if (typeof v === "bigint") return v;
  const raw = String(v ?? "0").trim();
  const match = raw.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!match) throw new TypeError(`Invalid integer value: \${raw}`);
  const [, sign, whole, fraction = "", exponentRaw = "0"] = match;
  const exponent = Number(exponentRaw);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 10000) throw new RangeError("Integer exponent out of range");
  let digits = whole + fraction;
  const scale = fraction.length - exponent;
  if (scale > 0) {
    const fractionalDigits = digits.slice(-scale);
    if (fractionalDigits.length < scale || /[1-9]/.test(fractionalDigits)) {
      throw new TypeError(`Value is not an integer: \${raw}`);
    }
    digits = digits.slice(0, -scale) || "0";
  } else if (scale < 0) {
    digits += "0".repeat(-scale);
  }
  const normalized = digits.replace(/^0+(?=\d)/, "");
  return BigInt((sign === "-" && normalized !== "0" ? "-" : "") + normalized);
}

export function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

/** 1500000000000 -> "1 500 000 000 000" */
export function groupDigits(v: string | number | null | undefined): string {
  const raw = String(v ?? 0).trim();
  if (/^[+-]?\d+(?:\.\d*)?[eE][+-]?\d+$/.test(raw)) {
    const exact = toBigInt(raw);
    const sign = exact < 0n ? "-" : "";
    const digits = (exact < 0n ? -exact : exact).toString();
    return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }
  const neg = raw.startsWith("-");
  const digits = raw.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
  const grouped = (digits || "0").replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (neg ? "-" : "") + grouped;
}

const BILLION = 1_000_000_000;

export function roundMoneyToBillion(v: string | number | null | undefined): number {
  return Math.round(toNum(v) / BILLION) * BILLION;
}

export function kr(v: string | number | null | undefined): string {
  return `${fmtNum(v)}${NBSP}KR`;
}

const SCALES: { limit: number; unit: string }[] = [
  { limit: 1e12, unit: "bln" },
  { limit: 1e9, unit: "mld" },
];

/** Skrót kwoty: pełne miliardy albo biliony z 3 miejscami po przecinku.
 * Wartości NUMERIC z Supabase przychodzą jako string — dla nich nie używamy
 * Number(), żeby nie tracić precyzji powyżej Number.MAX_SAFE_INTEGER.
 */
export function fmtNum(v: string | number | bigint | null | undefined): string {
  if (typeof v === "string" || typeof v === "bigint" || (typeof v === "number" && Math.abs(v) >= 1e15)) {
    const value = big(v);
    const sign = value < 0n ? "-" : "";
    const abs = value < 0n ? -value : value;

    if (abs >= 1_000_000_000_000n) {
      let whole = abs / 1_000_000_000_000n;
      const remainder = abs % 1_000_000_000_000n;
      let fraction = (remainder + 500_000_000n) / 1_000_000_000n;
      if (fraction === 1000n) {
        whole += 1n;
        fraction = 0n;
      }
      return sign + whole.toString() + "," + fraction.toString().padStart(3, "0") + NBSP + "bln";
    }

    if (abs >= 1_000_000_000n) {
      const billions = (abs + 500_000_000n) / 1_000_000_000n;
      return sign + billions.toString() + NBSP + "mld";
    }

    return groupDigits(value.toString());
  }

  const n = toNum(v);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  if (abs >= 1e12) {
    const x = abs / 1e12;
    return sign + x.toFixed(3).replace(".", ",") + NBSP + "bln";
  }

  if (abs >= 1e9) {
    const x = Math.round(abs / 1e9);
    return sign + x + NBSP + "mld";
  }

  return groupDigits(n);
}

/** Globalny skrót kwoty: 1,500 bln KR / 850 mld KR */
export function fmtKR(v: string | number | bigint | null | undefined): string {
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
  factory_6: "Fabryka VI",
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

/** Bezpieczna konwersja do BigInt — obsługuje liczby JS i zapis wykładniczy (np. 1e+30). */
export function big(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (v === null || v === undefined || v === "") return 0n;
  if (typeof v === "number") return Number.isFinite(v) ? BigInt(Math.trunc(v).toLocaleString("fullwide", { useGrouping: false })) : 0n;
  const s = String(v).trim();
  if (/^-?\d+$/.test(s)) return BigInt(s);
  const m = /^(-?)(\d+)(?:\.(\d*))?e\+?(\d+)$/i.exec(s);
  if (m) {
    const frac = m[3] ?? "";
    const exp = Number(m[4]);
    const digits = (m[2] + frac.padEnd(exp, "0").slice(0, exp)).replace(/^0+(?=\d)/, "");
    return BigInt(m[1] + digits);
  }
  const n = Number(s);
  return Number.isFinite(n) ? big(n) : 0n;
}
