/**
 * A small in-memory stand-in for the parts of supabase-js / PostgREST the
 * `src/lib/db/*` readers use. Test-only.
 *
 * It reproduces the two server behaviours the readers must survive, which a
 * mocked `.order()` spy never would:
 *
 *  - MAX ROWS. Every select returns at most `maxRows` rows (1000, as on
 *    Supabase), silently, exactly like PostgREST.
 *  - UNSTABLE TIES. Rows that compare equal on every ORDER BY column come back
 *    in insertion order for one page of a ranged read and reversed for the
 *    next (odd page index = reversed). Postgres gives
 *    no ordering guarantee for ties either; this just makes the consequence
 *    deterministic, so a list without a unique tie-breaker repeats and skips
 *    rows across pages every time instead of occasionally.
 */

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type PgError = { message: string; code: string };
type Result = {
  data: unknown;
  error: PgError | null;
  count: number | null;
};

export type FakeOptions = {
  tables?: Record<string, Row[]>;
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>;
  /** Make every query against these tables (or these RPCs) fail. */
  failTables?: Record<string, PgError>;
  failRpc?: Record<string, PgError>;
  maxRows?: number;
  user?: { id: string } | null;
};

const cmp = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1; // NULLS LAST
  if (b === null || b === undefined) return -1;
  return a < b ? -1 : 1;
};

export function createFakeSupabase(options: FakeOptions = {}) {
  const tables = options.tables ?? {};
  const maxRows = options.maxRows ?? 1000;
  let requests = 0;
  const log: { table: string; kind: string }[] = [];

  class Query implements PromiseLike<Result> {
    private filters: Filter[] = [];
    private orders: { column: string; ascending: boolean }[] = [];
    private rangeFrom: number | null = null;
    private rangeTo: number | null = null;
    private wantCount = false;
    private head = false;
    private mode: "many" | "maybeSingle" | "single" = "many";

    constructor(private table: string) {}

    select(_columns?: string, opts?: { count?: string; head?: boolean }) {
      this.wantCount = opts?.count === "exact";
      this.head = opts?.head ?? false;
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((r) => r[column] === value);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.filters.push((r) => values.includes(r[column]));
      return this;
    }
    is(column: string, value: null) {
      this.filters.push((r) => (r[column] ?? null) === value);
      return this;
    }
    not(column: string, _op: "is", value: null) {
      this.filters.push((r) => (r[column] ?? null) !== value);
      return this;
    }
    ilike(column: string, pattern: string) {
      const needle = pattern.replace(/%/g, "").toLowerCase();
      this.filters.push((r) =>
        String(r[column] ?? "")
          .toLowerCase()
          .includes(needle),
      );
      return this;
    }
    or() {
      return this;
    }
    order(column: string, opts?: { ascending?: boolean }) {
      this.orders.push({ column, ascending: opts?.ascending ?? true });
      return this;
    }
    range(from: number, to: number) {
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0) {
        throw new Error(`malformed range ${from}-${to}`);
      }
      this.rangeFrom = from;
      this.rangeTo = to;
      return this;
    }
    limit(n: number) {
      this.rangeFrom = 0;
      this.rangeTo = n - 1;
      return this;
    }
    maybeSingle() {
      this.mode = "maybeSingle";
      return this;
    }
    single() {
      this.mode = "single";
      return this;
    }

    private run(): Result {
      requests += 1;
      log.push({ table: this.table, kind: "select" });
      const failure = options.failTables?.[this.table];
      if (failure) return { data: null, error: failure, count: null };

      const size =
        this.rangeFrom !== null && this.rangeTo !== null
          ? this.rangeTo - this.rangeFrom + 1
          : 0;
      const reverseTies =
        size > 0 && Math.floor((this.rangeFrom ?? 0) / size) % 2 === 1;
      const matched = (tables[this.table] ?? [])
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => this.filters.every((f) => f(row)));

      matched.sort((a, b) => {
        for (const o of this.orders) {
          const c = cmp(a.row[o.column], b.row[o.column]);
          if (c !== 0) return o.ascending ? c : -c;
        }
        return reverseTies ? b.index - a.index : a.index - b.index;
      });

      const count = this.wantCount ? matched.length : null;
      if (this.head) return { data: null, error: null, count };

      let rows = matched.map((m) => m.row);
      if (this.rangeFrom !== null && this.rangeTo !== null) {
        rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
      }
      rows = rows.slice(0, maxRows);

      if (this.mode === "many") return { data: rows, error: null, count };
      if (rows.length > 1) {
        return {
          data: null,
          error: { message: "multiple rows", code: "PGRST116" },
          count,
        };
      }
      if (rows.length === 0 && this.mode === "single") {
        return {
          data: null,
          error: { message: "no rows", code: "PGRST116" },
          count,
        };
      }
      return { data: rows[0] ?? null, error: null, count };
    }

    then<T1 = Result, T2 = never>(
      onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return Promise.resolve()
        .then(() => this.run())
        .then(onfulfilled, onrejected);
    }
  }

  const client = {
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      requests += 1;
      log.push({ table: name, kind: "rpc" });
      const failure = options.failRpc?.[name];
      if (failure) return { data: null, error: failure };
      const handler = options.rpc?.[name];
      if (!handler) {
        return {
          data: null,
          error: { message: `no rpc ${name}`, code: "PGRST202" },
        };
      }
      return { data: handler(args), error: null };
    },
    auth: {
      getClaims: async () => ({
        data: options.user ? { claims: { sub: options.user.id } } : null,
      }),
    },
  };

  return {
    client,
    log,
    get requests() {
      return requests;
    },
  };
}

/** A deterministic v4-shaped uuid from a number, so ids sort predictably. */
export function uuid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}
