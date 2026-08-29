import { z } from "zod";

import {
  APP_ROLES,
  MEMBER_RANKS,
  MEMBER_STATUSES,
} from "@/lib/constants/enums";
import { passwordSchema } from "@/lib/validation/auth";

const username = z
  .string()
  .trim()
  .min(3, "At least 3 characters")
  .max(32, "At most 32 characters")
  .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers and underscores only");

const displayName = z
  .string()
  .trim()
  .min(1, "Display name is required")
  .max(80, "Display name is too long");

export const createMemberSchema = z.object({
  password: passwordSchema,
  username,
  rank: z.enum(MEMBER_RANKS),
  role: z.enum(APP_ROLES),
});
export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export const updateMemberSchema = z.object({
  displayName,
  rank: z.enum(MEMBER_RANKS),
  role: z.enum(APP_ROLES),
  status: z.enum(MEMBER_STATUSES),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const resetPasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm the password"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const MEMBER_LIST_STATUSES = ["all", "active", "inactive"] as const;
export type MemberListStatus = (typeof MEMBER_LIST_STATUSES)[number];
