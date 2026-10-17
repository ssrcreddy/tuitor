export const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Japanese",
  "Chinese (Mandarin)",
  "Korean",
  "Arabic",
  "Hindi",
  "Russian",
] as const;

export const PROFICIENCIES = ["native", "C2", "C1", "B2", "B1", "A2", "A1"] as const;
export type Proficiency = (typeof PROFICIENCIES)[number];

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
