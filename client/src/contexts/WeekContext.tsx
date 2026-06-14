import { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from "react";
import { getWeekForNowInTimezone, type WeekInfo } from "../weekTz";

const WeekContext = createContext<{
  week: WeekInfo;
  setWeek: (w: WeekInfo) => void;
} | null>(null);

export function WeekProvider({
  children,
  timezone,
}: {
  children: ReactNode;
  timezone?: string;
}) {
  const [week, setWeek] = useState<WeekInfo>(() => getWeekForNowInTimezone(timezone));

  useEffect(() => {
    setWeek(getWeekForNowInTimezone(timezone));
  }, [timezone]);

  const value = useMemo(() => ({ week, setWeek }), [week]);
  return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}

export function useWeek() {
  const ctx = useContext(WeekContext);
  if (!ctx) throw new Error("useWeek must be used within WeekProvider");
  return ctx;
}
