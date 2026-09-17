/**
 * Detail readers take ids straight from the URL. A malformed one is a request
 * for something that cannot exist — a 404 — not a database failure, so it is
 * answered before the query instead of being read back as Postgres error 22P02.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
