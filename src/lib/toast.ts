"use client";

import { useEffect, useRef } from "react";
import { toast as sonner } from "sonner";

/**
 * Thin wrapper over sonner so every call site has the same vocabulary.
 * Use for the outcome of a user action (save, delete, status change, …).
 */
export const toast = {
  success: (message: string, description?: string) =>
    sonner.success(message, description ? { description } : undefined),

  error: (message: string, description?: string) =>
    sonner.error(message, description ? { description } : undefined),

  info: (message: string, description?: string) =>
    sonner.message(message, description ? { description } : undefined),

  /** Resolve/reject a promise into a loading → success/error toast. */
  promise: <T>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string },
  ) => sonner.promise(promise, messages),
};

type FormLikeState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Toast when a `useActionState` result changes: `success` message on ok,
 * the returned error otherwise. Field-validation errors show inline in the
 * form and are intentionally not toasted.
 */
export function useActionToast(
  state: FormLikeState,
  options: { success?: string; onSuccess?: () => void } = {},
): void {
  const seen = useRef<FormLikeState>(state);
  const { success: successMessage, onSuccess } = options;

  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.ok) {
      if (successMessage) sonner.success(successMessage);
      onSuccess?.();
    } else if (state.error) {
      sonner.error(state.error);
    }
    // onSuccess is intentionally not a dep — callers pass an inline fn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, successMessage]);
}

/** Standard result shape returned by our server actions. */
export type ActionOutcome = { ok: boolean; error?: string } | undefined;

/**
 * Toast the outcome of an action result. Returns the same `ok` boolean so
 * callers can branch (`if (reportOutcome(res, "Saved")) router.refresh()`).
 */
export function reportOutcome(
  result: ActionOutcome,
  successMessage: string,
  fallbackError = "Something went wrong.",
): boolean {
  if (result && result.ok) {
    toast.success(successMessage);
    return true;
  }
  toast.error(result?.error ?? fallbackError);
  return false;
}
