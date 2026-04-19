import { createContext } from "react";

export type WeekInfo = { year: number; week: number };

export type WeekContextValue = {
  week: WeekInfo;
  setWeek: (w: WeekInfo) => void;
};

export const WeekContext = createContext<WeekContextValue | null>(null);
