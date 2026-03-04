"use client";

import { useState, useEffect } from "react";
import { NOTAM } from "@/lib/types";
import { NOTAM_POLL_MS } from "@/lib/constants";

export function useNotamPolling(): NOTAM[] {
  const [notams, setNotams] = useState<NOTAM[]>([]);

  useEffect(() => {
    const pollNotams = async () => {
      try {
        const res = await fetch("/api/notams");
        if (res.ok) {
          const json = await res.json();
          setNotams(json.notams || []);
        }
      } catch {
        /* keep existing data */
      }
    };
    pollNotams();
    const interval = setInterval(pollNotams, NOTAM_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  return notams;
}
