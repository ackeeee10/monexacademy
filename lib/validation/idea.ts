import { z } from "zod";

import { BUDGETS, TEAM_MODES, WORK_PREFERENCES } from "./profile";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const TIME_TO_INCOME = ["lt_1w", "1_4w", "1_3m", "3_6m", "6m_plus"] as const;
export const IDEA_SORTS = ["newest", "earning", "lowest_investment", "most_saved"] as const;
export const MAX_LAUNCH_STEPS = 20;
export const MAX_ROLES = 10;
export const MAX_SKILLS = 30;

const text = (min: number, max: number) =>
  z.string().trim().min(min, "tooShort").max(max, "tooLong");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .transform((v) => (v === "" ? undefined : v));

const money = z
  .number({ error: "numberInvalid" })
  .int("numberInvalid")
  .min(0, "numberInvalid")
  .max(100_000_000, "numberInvalid");

/** Fields of one idea. Used by the multi-step form and by the save action. */
export const ideaSchema = z
  .object({
    title: text(3, 90),
    shortDescription: text(10, 280),
    categoryId: z.uuid({ error: "choiceRequired" }),
    investmentRange: z.enum(BUDGETS, { error: "choiceRequired" }),
    earningMin: money,
    earningMax: money,
    difficulty: z.enum(DIFFICULTIES, { error: "choiceRequired" }),
    timeToFirstIncome: z.enum(TIME_TO_INCOME, { error: "choiceRequired" }),
    workMode: z.enum(WORK_PREFERENCES, { error: "choiceRequired" }),
    teamMode: z.enum(TEAM_MODES, { error: "choiceRequired" }),
    lookingForRoles: z
      .array(text(2, 30))
      .max(MAX_ROLES, "tooMany")
      .default([]),
    skillIds: z.array(z.uuid()).min(1, "skillsRequired").max(MAX_SKILLS, "tooMany"),
    launchPlan: z
      .array(text(3, 200))
      .min(3, "launchPlanTooShort")
      .max(MAX_LAUNCH_STEPS, "tooMany"),
    marketAnalysis: optionalText(4000),
    risks: optionalText(4000),
  })
  .refine((v) => v.earningMax >= v.earningMin, {
    path: ["earningMax"],
    error: "earningsInvalid",
  });

export type IdeaInput = z.input<typeof ideaSchema>;
export type IdeaData = z.output<typeof ideaSchema>;

/** Fields of each form step, so a step can be validated on its own. */
export const STEP_FIELDS = [
  ["title", "shortDescription", "categoryId"],
  ["investmentRange", "earningMin", "earningMax", "difficulty", "timeToFirstIncome"],
  ["workMode", "teamMode", "skillIds", "lookingForRoles"],
  ["launchPlan", "marketAnalysis", "risks"],
] as const satisfies readonly (readonly (keyof IdeaInput)[])[];

/** Filters and sort accepted by /ideas (kept in the URL, so links can be shared). */
export const ideaFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  budget: z.enum(BUDGETS).optional(),
  category: z.string().regex(/^[a-z0-9-]{2,60}$/).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  time: z.enum(TIME_TO_INCOME).optional(),
  mode: z.enum(WORK_PREFERENCES).optional(),
  team: z.enum(TEAM_MODES).optional(),
  minEarning: z.enum(["500", "1000", "3000"]).optional(),
  sort: z.enum(IDEA_SORTS).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
});
export type IdeaFilters = z.output<typeof ideaFiltersSchema>;
