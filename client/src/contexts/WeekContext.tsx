import { useState, useMemo, type ReactNode } from "react";
import { getISOWeek } from "../utils";
import { WeekContext, type WeekInfo } from "./weekContext";

export function WeekProvider({ children }: { children: ReactNode }) {
  const [week, setWeek] = useState<WeekInfo>(() => getISOWeek(new Date()));
  const value = useMemo(() => ({ week, setWeek }), [week]);
  return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}
