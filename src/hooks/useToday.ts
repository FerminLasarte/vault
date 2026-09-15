import { useEffect, useState } from "react";
import { todayIsoDate } from "@/lib/format";

// Today's date, kept current while the app stays open.
//
// Read once at render, "today" stayed on the day the screen was opened: left
// open overnight, badges, pending lists and the default period all missed
// whatever fell due after midnight until something else re-rendered them.
// Moves on at midnight, and again whenever the window comes back — a computer
// that slept through midnight does not fire timers on time.
export function useToday(): string {
  const [today, setToday] = useState(todayIsoDate);

  useEffect(() => {
    // Read again rather than stepped forward by one: after a sleep, several
    // days may have gone by. Setting the same string again renders nothing.
    const catchUp = () => setToday(todayIsoDate());

    let timer: ReturnType<typeof setTimeout>;
    function scheduleMidnight() {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      // A second past it, so a timer that fires a hair early still lands on
      // the new day.
      timer = setTimeout(
        () => {
          catchUp();
          scheduleMidnight();
        },
        midnight.getTime() - now.getTime() + 1000,
      );
    }

    scheduleMidnight();
    window.addEventListener("focus", catchUp);
    document.addEventListener("visibilitychange", catchUp);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", catchUp);
      document.removeEventListener("visibilitychange", catchUp);
    };
  }, []);

  return today;
}
