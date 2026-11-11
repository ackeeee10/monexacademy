import { z } from "zod";

import { COUNTRY_CODES } from "@/lib/countries";

import { acceptTerms, birthDate, username } from "./shared";

export const INTENTS = ["seeking_idea", "idea_owner", "talent"] as const;
export const BUDGETS = ["0", "1_100", "100_1000", "1000_5000", "5000_20000", "20000_plus"] as const;
export const WORK_PREFERENCES = ["online", "irl", "both"] as const;
export const TEAM_MODES = ["solo", "team"] as const;
export const WEEKLY_TIMES = ["lt_5", "5_15", "15_30", "full_time"] as const;
export const LOOKING_FOR = ["partner", "job", "idea"] as const;

const uuidList = (max: number) => z.array(z.uuid()).max(max, "tooMany");

export const preferencesSchema = z.object({
  intents: z.array(z.enum(INTENTS)).min(1, "intentsRequired"),
  budgetRange: z.enum(BUDGETS, { error: "choiceRequired" }),
  workPreference: z.enum(WORK_PREFERENCES, { error: "choiceRequired" }),
  teamMode: z.enum(TEAM_MODES, { error: "choiceRequired" }),
  weeklyTime: z.enum(WEEKLY_TIMES, { error: "choiceRequired" }),
  categories: uuidList(20),
  skills: uuidList(30),
});
export type PreferencesInput = z.input<typeof preferencesSchema>;

export const onboardingSchema = preferencesSchema.extend({
  username,
  /** Only required for accounts that don't have them yet (Google, magic link). */
  birthDate: birthDate.optional(),
  acceptTerms: acceptTerms.optional(),
});
export type OnboardingInput = z.input<typeof onboardingSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .transform((v) => (v === "" ? null : v));

const httpUrl = z
  .string()
  .trim()
  .max(300, "tooLong")
  .refine((v) => /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v), "urlInvalid");

export const profileSchema = z.object({
  username,
  bio: optionalText(500),
  experience: optionalText(2000),
  country: z
    .string()
    .refine((v) => v === "" || (COUNTRY_CODES as readonly string[]).includes(v), "choiceRequired")
    .transform((v) => (v === "" ? null : v)),
  city: optionalText(80),
  availabilityHours: z
    .union([z.literal(""), z.coerce.number().int("numberInvalid").min(0, "numberInvalid").max(80, "numberInvalid")])
    .transform((v) => (v === "" ? null : v)),
  lookingFor: z.array(z.enum(LOOKING_FOR)),
  skills: uuidList(30),
  links: z.array(z.object({ label: z.string().trim().min(1, "required").max(40, "tooLong"), url: httpUrl })).max(10, "tooMany"),
  portfolio: z
    .array(
      z.object({
        title: z.string().trim().min(1, "required").max(80, "tooLong"),
        url: z.union([z.literal(""), httpUrl]),
      }),
    )
    .max(10, "tooMany"),
});
export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileOutput = z.output<typeof profileSchema>;

export const deleteAccountSchema = z.object({
  confirmation: z.string().trim().min(1, "required"),
  captchaToken: z.string().max(4096).optional(),
});
export type DeleteAccountInput = z.input<typeof deleteAccountSchema>;

export { username as usernameSchema };
export { acceptTerms, birthDate };
