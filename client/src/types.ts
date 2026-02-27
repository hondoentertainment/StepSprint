export type User = {
  id: string;
  email: string;
  name?: string | null;
  role: "ADMIN" | "PARTICIPANT";
};

export type Challenge = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  timezone: string;
  teamSize: number;
  locked: boolean;
};

export type Summary = {
  personalTotals: { today: number; week: number; month: number };
  teamTotals: { teamName: string; total: number };
  rank: number | null;
  gapToFirst: number;
  streak: { currentDays: number; longestDays: number };
  consistency: { activeDays: number; elapsedDays: number; score: number };
};

export type WeeklyEntry = {
  userId: string;
  name: string;
  email: string;
  steps: number;
  trend: "up" | "down" | "same";
  delta: number;
};

export type TeamEntry = {
  teamId: string;
  teamName: string;
  totalSteps: number;
  avgSteps: number;
  leaderName: string;
  leaderSteps: number;
  stepsBehind: number;
};

export type Submission = {
  id: string;
  date: string;
  steps: number;
  isFlagged: boolean;
  user: { email: string; name?: string | null };
  challenge: { name: string };
};

export const TABS = ["Home", "Submit", "Weekly Top Steppers", "Team Standings", "Admin"] as const;
export type Tab = (typeof TABS)[number];
