"use server";

import type { Route } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { usernameToEmail } from "@/lib/auth/member-credentials";
import { getUser } from "@/lib/auth/session";
import { fieldErrorsFrom, rpcErrorMessage, type FormState } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  REMEMBER_COOKIE,
  REMEMBER_MAX_AGE,
} from "@/lib/supabase/session-cookies";
import { changePasswordSchema, signInSchema } from "@/lib/validation/auth";

const GENERIC_SIGNIN_ERROR = "That username and password did not match.";

const THROTTLE_WINDOW_SECONDS = 15 * 60;
const THROTTLE_BLOCK_SECONDS = 15 * 60;

/** Best-effort client IP. On Vercel `x-real-ip` is set by the platform. */
async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * Records an attempt against `key`; returns seconds to wait (0 = allowed).
 * Best-effort: any failure (RPC not migrated yet, service key missing, network)
 * fails open so a broken limiter never locks everyone out.
 */
async function throttleWait(key: string, limit: number): Promise<number> {
  try {
    const { data, error } = await createAdminClient().rpc("hit_auth_throttle", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: THROTTLE_WINDOW_SECONDS,
      p_block_seconds: THROTTLE_BLOCK_SECONDS,
    });
    if (error || typeof data !== "number") return 0;
    return data;
  } catch {
    return 0;
  }
}

/** Resets a counter after a legitimate success. Best-effort. */
async function clearThrottle(key: string): Promise<void> {
  try {
    await createAdminClient().rpc("clear_auth_throttle", { p_key: key });
  } catch {
    // ignore — the counter expires on its own window
  }
}

function retryMessage(prefix: string, waitSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(waitSeconds / 60));
  return `${prefix} Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export async function signIn(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
    remember: formData.get("remember"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  // Rate limit before touching the auth provider. A generous per-IP ceiling
  // (members share in-game NATs) plus a tight per-username limit that is the
  // real brute-force guard.
  const ipKey = `signin:ip:${await clientIp()}`;
  const userKey = `signin:user:${parsed.data.username}`;
  const [ipWait, userWait] = await Promise.all([
    throttleWait(ipKey, 50),
    throttleWait(userKey, 8),
  ]);
  const wait = Math.max(ipWait, userWait);
  if (wait > 0) {
    return {
      ok: false,
      error: retryMessage("Too many sign-in attempts.", wait),
    };
  }

  // Persist the choice before the client is created — the Supabase cookie
  // handlers read it while writing the fresh session cookies below.
  const cookieStore = await cookies();
  cookieStore.set(REMEMBER_COOKIE, parsed.data.remember ? "1" : "0", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: REMEMBER_MAX_AGE,
  });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(parsed.data.username),
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { ok: false, error: GENERIC_SIGNIN_ERROR };
  }

  // Block sign-in for members who are not ACTIVE (PRD §4).
  const { data: member } = await supabase
    .from("members")
    .select("status")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!member || member.status !== "ACTIVE") {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "This account is inactive. Contact a Super Admin.",
    };
  }

  // Clear the per-username counter so a few typos before a correct password
  // don't leave the account locked.
  await clearThrottle(userKey);

  const next = parsed.data.next;
  const target: Route =
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\")
      ? (next as Route)
      : "/dashboard";
  redirect(target);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const parsed = changePasswordSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const throttleKey = `pwchange:${user.id}`;
  const wait = await throttleWait(throttleKey, 5);
  if (wait > 0) {
    return {
      ok: false,
      error: retryMessage("Too many password-change attempts.", wait),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(
        error,
        "Could not update your password. Try again in a moment.",
      ),
    };
  }

  await clearThrottle(throttleKey);
  return { ok: true };
}
