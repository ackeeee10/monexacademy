import { z } from "zod";

import { acceptTerms, birthDate, captchaToken, email, password } from "./shared";

export const signUpSchema = z.object({
  email,
  password,
  birthDate,
  acceptTerms,
  captchaToken,
});
export type SignUpInput = z.input<typeof signUpSchema>;

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "passwordRequired").max(72),
  captchaToken,
  next: z.string().optional(),
});
export type SignInInput = z.input<typeof signInSchema>;

export const magicLinkSchema = z.object({ email, captchaToken, next: z.string().optional() });
export type MagicLinkInput = z.input<typeof magicLinkSchema>;

export const resetRequestSchema = z.object({ email, captchaToken });
export type ResetRequestInput = z.input<typeof resetRequestSchema>;

export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "passwordsDontMatch", path: ["confirm"] });
export type NewPasswordInput = z.input<typeof newPasswordSchema>;

export const totpCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "codeInvalid"),
});
export type TotpCodeInput = z.input<typeof totpCodeSchema>;
