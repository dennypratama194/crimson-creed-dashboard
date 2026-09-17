import { describe, expect, it } from "vitest";

import { fieldErrorsFrom, rpcErrorMessage } from "@/lib/forms";

const FALLBACK = "Could not save.";

describe("rpcErrorMessage", () => {
  it("passes through the human messages our RPCs raise on purpose", () => {
    expect(
      rpcErrorMessage(
        { message: "This action requires Super Admin", code: "42501" },
        FALLBACK,
      ),
    ).toBe("This action requires Super Admin");
    expect(
      rpcErrorMessage(
        { message: "Only PENDING orders can be cancelled", code: "P0001" },
        FALLBACK,
      ),
    ).toBe("Only PENDING orders can be cancelled");
  });

  it("passes through a member quota refusal (CC429, migration 0079)", () => {
    const message = "You're submitting too fast. Try again in about 1 minute.";
    expect(rpcErrorMessage({ code: "CC429", message }, "fallback")).toBe(
      message,
    );
  });

  it("hides unexpected database error codes", () => {
    expect(
      rpcErrorMessage(
        { message: 'relation "orders" does not exist', code: "42P01" },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
    expect(
      rpcErrorMessage(
        { message: "deadlock detected", code: "40P01" },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });

  it("hides system phrasings that name schema objects, even on allowed codes", () => {
    expect(
      rpcErrorMessage(
        {
          message:
            'new row for relation "orders" violates check constraint "orders_note_max_len"',
          code: "23514",
        },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
    expect(
      rpcErrorMessage(
        { message: "permission denied for table cash_entries" },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });

  it("hides oversized messages and falls back when there is none", () => {
    expect(
      rpcErrorMessage({ message: "x".repeat(181), code: "P0001" }, FALLBACK),
    ).toBe(FALLBACK);
    expect(rpcErrorMessage({ message: "   " }, FALLBACK)).toBe(FALLBACK);
    expect(rpcErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(rpcErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
  });
});

describe("fieldErrorsFrom", () => {
  it("keeps the first message per top-level field", () => {
    expect(
      fieldErrorsFrom([
        { path: ["name"], message: "Name is required" },
        { path: ["name"], message: "Name is too long" },
        { path: ["items", 0, "quantity"], message: "Must be positive" },
        { path: [], message: "Something is off" },
      ]),
    ).toEqual({
      name: "Name is required",
      items: "Must be positive",
      form: "Something is off",
    });
  });
});
