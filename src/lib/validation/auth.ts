import { z } from "zod";

export const signInSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Enter your username")
    .max(32, "That username is too long")
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters");

export const changePasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
