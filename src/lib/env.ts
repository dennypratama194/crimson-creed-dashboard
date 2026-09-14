import { z } from "zod";

/**
 * Validated environment. Public vars are referenced statically so Next can
 * inline them into the client bundle. Server-only vars are read lazily so the
 * client build never needs them.
 */

const urlish = z
  .string()
  .min(1)
  .refine((v) => v.startsWith("http://") || v.startsWith("https://"), {
    message: "must be an http(s) URL",
  });

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: urlish,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: urlish.optional(),
});

export const publicEnv = publicSchema.parse({
  // Fall back to the name Vercel's Supabase integration generated (prefixed) when
  // the canonical var is unset/empty. `||` (not `??`) so an empty string falls through.
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_STORAGE_NEXT_PUBLIC_SUPABASE_URL_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_STORAGE_NEXT_PUBLIC_SUPABASE_URL_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

let cachedServerEnv: { SUPABASE_SERVICE_ROLE_KEY: string } | undefined;

/** Server-only. Throws if called where the service-role key is not present. */
export function serverEnv() {
  if (!cachedServerEnv) {
    cachedServerEnv = z
      .object({ SUPABASE_SERVICE_ROLE_KEY: z.string().min(1) })
      .parse({
        SUPABASE_SERVICE_ROLE_KEY:
          process.env.SUPABASE_SERVICE_ROLE_KEY ||
          process.env
            .STORAGE_NEXT_PUBLIC_SUPABASE_URL_SUPABASE_SERVICE_ROLE_KEY,
      });
  }
  return cachedServerEnv;
}
