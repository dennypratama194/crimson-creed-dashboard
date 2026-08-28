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

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(value: string | Date): string {
  return dateFmt.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFmt.format(
    typeof value === "string" ? new Date(value) : value,
  );
}
