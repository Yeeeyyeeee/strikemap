"use client";

import Header from "@/components/Header";
import ReportPanel from "@/components/ReportPanel";
import { useIncidents } from "@/hooks/useIncidents";

export default function ReportPage() {
  const { incidents } = useIncidents();

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Header incidents={incidents} />
      <main className="h-full w-full pt-14 relative z-0">
        <ReportPanel />
      </main>
    </div>
  );
}
