/** Display formatters. In-game fictional currency — shown with a plain `$`. */

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "$0";
  return `$${money.format(n)}`;
}

const integer = new Intl.NumberFormat("en-US");

export function formatQuantity(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? integer.format(n) : "0";
}

const percent = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** `15.5` -> `"15.5%"`. Caller decides whether to strip the sign. */
export function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${percent.format(value)}%` : "—";
}

/**
 * Every timestamp is stored in UTC and read back in the crew's own clock —
 * Los Santos runs on GMT+7 here — so the server and the browser never disagree
 * about what day an order was placed.
 */
export const APP_TIME_ZONE = "Asia/Jakarta";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: APP_TIME_ZONE,
});
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

export function formatDate(value: string | Date): string {
  return dateFmt.format(typeof value === "string" ? new Date(value) : value);
}

const dayShortFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "2026-08-29" -> "Aug 29". Parsed as UTC so the day never shifts. */
export function formatDayShort(isoDate: string): string {
  return dayShortFmt.format(new Date(`${isoDate}T00:00:00Z`));
}

const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-08" (or a full ISO string) -> "August 2026". */
export function formatMonth(value: string): string {
  const iso = value.length === 7 ? `${value}-01T00:00:00Z` : value;
  return monthFmt.format(new Date(iso));
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFmt.format(
    typeof value === "string" ? new Date(value) : value,
  );
}

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

/** "9:30 PM" — clock time only, for rows that show the date separately. */
export function formatTime(value: string | Date): string {
  return timeFmt.format(typeof value === "string" ? new Date(value) : value);
}

/** "ITEM_UPDATED" -> "Item updated" */
export function humanizeToken(token: string): string {
  const lower = token.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
