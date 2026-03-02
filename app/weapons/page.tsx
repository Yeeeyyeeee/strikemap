"use client";

import Header from "@/components/Header";
import WeaponsDatabase from "@/components/WeaponsDatabase";
import { useIncidents } from "@/hooks/useIncidents";

export default function WeaponsPage() {
  const { incidents } = useIncidents();

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Header incidents={incidents} />
      <main className="h-full w-full pt-14 relative z-0">
        <WeaponsDatabase />
      </main>
    </div>
  );
}
