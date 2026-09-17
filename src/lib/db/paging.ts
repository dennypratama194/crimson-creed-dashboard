/**
 * Paging primitives shared by the `src/lib/db/*` readers.
 *
 * Two failure modes these exist for:
 *
 *  1. PostgREST caps every response at max-rows (1000 on Supabase) and does not
 *     say so. A query that "reads everything" is therefore a query that reads
 *     the first 1000 rows and silently drops the rest.
 *  2. `?page=` arrives from the URL. `Number("1.5")`, `Number("Infinity")` and
 *     `Number("-3")` all survive a naive `Math.max(1, n)` and turn into a
 *     fractional, infinite or absurd offset.
 *
 * Not `server-only`: nothing here touches a client or a secret, and the unit
 * tests exercise it directly.
 */

/** Deepest page a list will serve. Far past any real list; stops absurd offsets. */
export const MAX_PAGE = 10_000;

/** A page number from untrusted input: a whole number in [1, MAX_PAGE]. */
export function clampPage(input: unknown): number {
  const n = typeof input === "string" ? Number(input) : input;
  if (typeof n !== "number" || !Number.isFinite(n)) return 1;
  return Math.min(MAX_PAGE, Math.max(1, Math.floor(n)));
}

/** The inclusive PostgREST `.range()` bounds for a page. */
export function pageBounds(
  page: unknown,
  pageSize: number,
): { page: number; from: number; to: number } {
  const p = clampPage(page);
  const from = (p - 1) * pageSize;
  return { page: p, from, to: from + pageSize - 1 };
}

/**
 * Rows per request when reading a whole set in batches. Must stay BELOW the
 * server's max-rows: a batch that the server cuts short would look exactly
 * like the last batch, and the loop would stop early.
 */
export const READ_BATCH = 500;

/**
 * Upper bound on a batched read. A reader that would pass this is not a
 * picker or a catalogue any more — it needs real pagination or an aggregate —
 * so it fails loudly instead of returning a silently partial list.
 */
export const READ_ALL_LIMIT = 20_000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Reads a complete result set in bounded batches.
 *
 * `fetchPage(from, to)` must return the same query each time with
 * `.range(from, to)` applied, ordered by a UNIQUE key (normally ending in
 * `id`). Without a unique order, rows on a batch boundary can repeat or vanish.
 */
export async function readAllRows<T>(
  fetchPage: (from: number, to: number) => PageResult<T>,
  options: { batch?: number; limit?: number } = {},
): Promise<T[]> {
  const batch = options.batch ?? READ_BATCH;
  const limit = options.limit ?? READ_ALL_LIMIT;
  const out: T[] = [];

  for (let from = 0; ; from += batch) {
    const { data, error } = await fetchPage(from, from + batch - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < batch) return out;
    if (out.length >= limit) {
      throw new Error(
        `readAllRows: more than ${limit} rows — this list needs real pagination`,
      );
    }
  }
}

/** Splits ids into small groups so no request carries a giant `in (...)` list. */
export function chunk<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

/** How many ids go into one `in (...)` filter. */
export const ID_CHUNK = 100;
