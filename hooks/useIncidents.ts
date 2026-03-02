"use client";

import { useState, useEffect } from "react";
import { Incident } from "@/lib/types";

/** Shared hook to fetch incidents from the API (used by sub-pages) */
export function useIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/incidents")
      .then((r) => r.json())
      .then((d) => setIncidents(d.incidents || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { incidents, loading };
}
