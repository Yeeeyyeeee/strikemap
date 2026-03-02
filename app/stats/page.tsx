"use client";

import Header from "@/components/Header";
import StatsBoard from "@/components/StatsBoard";
import { useIncidents } from "@/hooks/useIncidents";

export default function StatsPage() {
  const { incidents } = useIncidents();

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Header incidents={incidents} />
      <main className="h-full w-full pt-14 relative z-0">
        <StatsBoard incidents={incidents} />
      </main>
    </div>
  );
}
