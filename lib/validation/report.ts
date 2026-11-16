import { z } from "zod";

export const REPORT_REASONS = [
  "spam",
  "scam",
  "prohibited",
  "inappropriate",
  "copyright",
  "suspected_minor",
  "other",
] as const;

export const reportSchema = z.object({
  targetType: z.enum(["idea", "profile"]),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASONS, { error: "choiceRequired" }),
  details: z.string().trim().max(1000, "tooLong").optional(),
});

export type ReportInput = z.input<typeof reportSchema>;
