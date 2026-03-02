"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import HeatmapMap from "@/components/HeatmapMap";
import MediaFeedPanel from "@/components/MediaFeedPanel";
import SirenBanner from "@/components/SirenBanner";
import { useIncidents } from "@/hooks/useIncidents";
import { useSirenPolling } from "@/hooks/useSirenPolling";

interface HeatmapArea {
  lat: number;
  lng: number;
  name: string;
}

export default function HeatmapPage() {
  const { incidents } = useIncidents();
  const [selectedArea, setSelectedArea] = useState<HeatmapArea | null>(null);
  const [warningDismissed, setWarningDismissed] = useState(true);

  const { sirenAlerts } = useSirenPolling({
    soundEnabled: false,
    notificationsEnabled: false,
  });

  // Content warning — check localStorage on mount
  useEffect(() => {
    const dismissed = localStorage.getItem("heatmap-warning-dismissed");
    setWarningDismissed(dismissed === "true");
  }, []);

  const dismissWarning = () => {
    localStorage.setItem("heatmap-warning-dismissed", "true");
    setWarningDismissed(true);
  };

  return (
    <div className="h-screen w-screen overflow-hidden">
      <SirenBanner alerts={sirenAlerts} />
      <Header incidents={incidents} />
      <main className="h-full w-full pt-14 relative z-0 flex">
        <HeatmapMap onAreaSelect={setSelectedArea} className="flex-1" />
        {selectedArea && (
          <MediaFeedPanel area={selectedArea} onClose={() => setSelectedArea(null)} />
        )}

        {/* Content warning overlay */}
        {!warningDismissed && (
          <div className="absolute inset-0 bg-black/90 z-50 flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-4">
              <div className="text-4xl">&#9888;</div>
              <h2 className="text-lg font-bold text-neutral-200">Content Warning</h2>
              <p className="text-sm text-neutral-400 leading-relaxed">
                This page contains media from active conflict zones. Images and videos
                may depict graphic content including military strikes, destruction,
                and their aftermath.
              </p>
              <button
                onClick={dismissWarning}
                className="px-6 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium rounded-lg border border-neutral-600 transition-colors"
              >
                I understand, continue
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
