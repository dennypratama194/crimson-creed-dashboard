"use server";

import type { Route } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { usernameToEmail } from "@/lib/auth/member-credentials";
import { getUser } from "@/lib/auth/session";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { fieldErrorsFrom, rpcErrorMessage, type FormState } from "@/lib/forms";
import {
  rateLimitClear,
  rateLimitHit,
  retryAfterMessage,
  type RateLimitRule,
} from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import {
  REMEMBER_COOKIE,
  REMEMBER_MAX_AGE,
} from "@/lib/supabase/session-cookies";
import { changePasswordSchema, signInSchema } from "@/lib/validation/auth";

const GENERIC_SIGNIN_ERROR = "That username and password did not match.";

// Auth counters use a long window: a 15-minute lockout on a burst of bad
// attempts, versus the 60s default the mutating actions run with.
const AUTH_THROTTLE: Omit<RateLimitRule, "limit"> = {
  windowSeconds: 15 * 60,
  blockSeconds: 15 * 60,
};

/** Platform-set client IP, or null when forwarding headers are not trusted. */
async function clientIp(): Promise<string | null> {
  return clientIpFromHeaders(await headers(), {
    VERCEL: process.env.VERCEL,
    TRUST_PROXY_HEADERS: process.env.TRUST_PROXY_HEADERS,
  });
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
  // real brute-force guard. The per-IP limit only runs when the IP comes from a
  // trusted platform header (see clientIpFromHeaders). Both fall back to an
  // in-process limiter if the database limiter is down.
  // `parsed.data.username` is already trimmed + lower-cased by signInSchema, so
  // the per-username counter cannot be dodged by varying case.
  const ip = await clientIp();
  const userKey = `signin:user:${parsed.data.username}`;
  const [ipWait, userWait] = await Promise.all([
    ip
      ? rateLimitHit(
          `signin:ip:${ip}`,
          { ...AUTH_THROTTLE, limit: 50 },
          "local",
        )
      : 0,
    rateLimitHit(userKey, { ...AUTH_THROTTLE, limit: 8 }, "local"),
  ]);
  const wait = Math.max(ipWait, userWait);
  if (wait > 0) {
    return {
      ok: false,
      error: retryAfterMessage("Too many sign-in attempts.", wait),
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
  await rateLimitClear(userKey);

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
  const wait = await rateLimitHit(
    throttleKey,
    { ...AUTH_THROTTLE, limit: 5 },
    "local",
  );
  if (wait > 0) {
    return {
      ok: false,
      error: retryAfterMessage("Too many password-change attempts.", wait),
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

  await rateLimitClear(throttleKey);
  return { ok: true };
}
