/** Shared form shapes for the idea form (kept out of the client component so pages can import them). */

export type FormCategory = { id: string; name: string };
export type FormSkill = { id: string; name: string };

/** Everything as the inputs hold it (text and numbers as typed). */
export type IdeaFormValues = {
  title: string;
  shortDescription: string;
  categoryId: string;
  investmentRange: string;
  earningMin: string;
  earningMax: string;
  difficulty: string;
  timeToFirstIncome: string;
  workMode: string;
  teamMode: string;
  skillIds: string[];
  lookingForRoles: string[];
  launchPlan: string[];
  marketAnalysis: string;
  risks: string;
};

export const EMPTY_VALUES: IdeaFormValues = {
  title: "",
  shortDescription: "",
  categoryId: "",
  investmentRange: "",
  earningMin: "",
  earningMax: "",
  difficulty: "",
  timeToFirstIncome: "",
  workMode: "",
  teamMode: "",
  skillIds: [],
  lookingForRoles: [],
  launchPlan: ["", "", ""],
  marketAnalysis: "",
  risks: "",
};
