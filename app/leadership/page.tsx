"use client";

import Header from "@/components/Header";
import LeadershipBoard from "@/components/LeadershipBoard";
import { useIncidents } from "@/hooks/useIncidents";

export default function LeadershipPage() {
  const { incidents } = useIncidents();

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Header incidents={incidents} />
      <main className="h-full w-full pt-14 relative z-0">
        <LeadershipBoard />
      </main>
    </div>
  );
}
