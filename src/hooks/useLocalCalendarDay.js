import { useEffect, useState } from "react";
import { getCurrentDate } from "../utils/helpers";

export function useLocalCalendarDay() {
  const [today, setToday] = useState(getCurrentDate);
  useEffect(() => {
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      setToday(getCurrentDate());
      const now = new Date();
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      timer = setTimeout(
        refresh,
        Math.max(100, midnight.getTime() - now.getTime() + 20),
      );
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}
