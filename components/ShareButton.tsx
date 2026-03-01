"use client";

import { useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { ViewMode } from "@/lib/types";
import { encodeState } from "@/lib/urlState";

interface ShareButtonProps {
  mapInstance: mapboxgl.Map | null;
  viewMode: ViewMode;
  selectedIncidentId?: string;
}

function copyToClipboard(text: string): boolean {
  // Try modern API first
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  // Always also use the fallback for reliability on localhost/HTTP
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return true;
  } catch {
    return false;
  }
}

export function useShare({ mapInstance, viewMode, selectedIncidentId }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(() => {
    const state: Parameters<typeof encodeState>[0] = { viewMode };

    if (mapInstance) {
      const center = mapInstance.getCenter();
      state.center = [center.lng, center.lat];
      state.zoom = mapInstance.getZoom();
    }

    if (selectedIncidentId) {
      state.selectedId = selectedIncidentId;
    }

    const query = encodeState(state);
    const url = `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ""}`;

    copyToClipboard(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [mapInstance, viewMode, selectedIncidentId]);

  return { handleShare, copied };
}
