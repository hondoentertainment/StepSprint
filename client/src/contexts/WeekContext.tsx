import { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import { getISOWeek } from "../utils";

type WeekInfo = { year: number; week: number };

const WeekContext = createContext<{
  week: WeekInfo;
  setWeek: (w: WeekInfo) => void;
} | null>(null);

export function WeekProvider({ children }: { children: ReactNode }) {
  const [week, setWeek] = useState<WeekInfo>(() => getISOWeek(new Date()));
  const value = useMemo(() => ({ week, setWeek }), [week]);
  return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}

export function useWeek() {
  const ctx = useContext(WeekContext);
  if (!ctx) throw new Error("useWeek must be used within WeekProvider");
  return ctx;
}
