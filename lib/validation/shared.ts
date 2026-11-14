import { z } from "zod";

/** Error messages are translation keys under "Errors" in messages/*.json. */
export const email = z.string().trim().toLowerCase().pipe(z.email("emailInvalid").max(254, "emailInvalid"));

export const password = z.string().min(8, "passwordTooShort").max(72, "passwordTooLong");

export const USERNAME_PATTERN = /^[a-z0-9._]{3,20}$/;
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, "usernameInvalid");

/** Age in whole years on `today` for an ISO date string (YYYY-MM-DD). */
export function ageOn(isoDate: string, today: Date = new Date()): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return Number.NaN;
  let age = today.getUTCFullYear() - y;
  const beforeBirthday = today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export const birthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "birthDateInvalid")
  .refine((v) => !Number.isNaN(Date.parse(v)) && Number(v.slice(0, 4)) >= 1900, "birthDateInvalid")
  .refine((v) => ageOn(v) >= 18, "mustBe18");

export const acceptTerms = z.literal(true, { error: "termsRequired" });

/** Turnstile token; optional only when Turnstile isn't configured (local dev). */
export const captchaToken = z.string().max(4096).optional();
