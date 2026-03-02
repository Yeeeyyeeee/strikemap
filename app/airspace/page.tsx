"use client";

import Header from "@/components/Header";
import AirspaceDashboard from "@/components/AirspaceDashboard";
import { useIncidents } from "@/hooks/useIncidents";

export default function AirspacePage() {
  const { incidents } = useIncidents();

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Header incidents={incidents} />
      <main className="h-full w-full pt-14 relative z-0">
        <AirspaceDashboard incidents={incidents} />
      </main>
    </div>
  );
}
