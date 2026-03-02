"use client";

import Header from "@/components/Header";
import InterceptDashboard from "@/components/InterceptDashboard";
import { useIncidents } from "@/hooks/useIncidents";

export default function InterceptPage() {
  const { incidents } = useIncidents();

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Header incidents={incidents} />
      <main className="h-full w-full pt-14 relative z-0">
        <InterceptDashboard incidents={incidents} />
      </main>
    </div>
  );
}
