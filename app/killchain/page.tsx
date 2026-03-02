"use client";

import Header from "@/components/Header";
import KillChainView from "@/components/KillChainView";
import { useIncidents } from "@/hooks/useIncidents";

export default function KillChainPage() {
  const { incidents } = useIncidents();

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Header incidents={incidents} />
      <main className="h-full w-full pt-14 relative z-0">
        <KillChainView incidents={incidents} onSelectIncident={() => {}} />
      </main>
    </div>
  );
}
