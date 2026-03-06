"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { MilitaryBase, OPERATOR_LABELS, BASE_COLORS } from "@/lib/militaryBases";

interface BaseCardProps {
  base: MilitaryBase;
  map: mapboxgl.Map;
  onClose: () => void;
}

const CARD_WIDTH = 360;
const CARD_OFFSET = 24;

const TYPE_LABELS: Record<MilitaryBase["type"], string> = {
  air: "Air Base",
  naval: "Naval Base",
  army: "Army Base",
  missile: "Missile Site",
  nuclear: "Nuclear Facility",
};

const TYPE_DESCRIPTIONS: Record<MilitaryBase["type"], string> = {
  air: "Military airfield used for fighter aircraft operations, aerial refueling, reconnaissance, and strategic airlift capabilities.",
  naval: "Naval installation supporting maritime operations including fleet basing, patrol craft, coastal defense, and port logistics.",
  army: "Ground forces installation housing infantry, armored, and mechanized units along with command and logistics infrastructure.",
  missile: "Strategic or tactical missile launch facility capable of housing ballistic missiles, cruise missiles, or air defense systems.",
  nuclear: "Facility associated with nuclear research, uranium enrichment, weapons development, or nuclear energy production.",
};

const OPERATOR_DESCRIPTIONS: Record<MilitaryBase["operator"], string> = {
  iran: "Islamic Republic of Iran Armed Forces (Artesh) or Islamic Revolutionary Guard Corps (IRGC). Iran maintains a large conventional military alongside the IRGC, which operates independently with its own ground, naval, aerospace, and Quds Force branches.",
  iran_proxy: "Iran-aligned militia or paramilitary group operating under the umbrella of the IRGC Quds Force. These include Hezbollah (Lebanon), Houthi/Ansar Allah (Yemen), Popular Mobilization Forces (Iraq), and various Syrian militias.",
  us_coalition: "United States Armed Forces or allied coalition partner. The US maintains a significant military presence across the Middle East through CENTCOM, with forward-deployed air, naval, and ground assets across multiple host nations.",
  israel: "Israel Defense Forces (IDF). Israel maintains one of the most technologically advanced militaries in the region with significant air power, missile defense systems (Iron Dome, David's Sling, Arrow), and intelligence capabilities.",
  russia: "Russian Armed Forces. Russia maintains a military presence in Syria through agreements with the Assad government, operating air and naval assets from bases in Latakia and Tartus.",
  regional: "Armed forces of a regional nation-state in the Middle East, North Africa, or Eastern Mediterranean. These forces operate independently but may participate in bilateral or multilateral defense agreements.",
};

function getBaseTypeIcon(type: MilitaryBase["type"]): React.ReactNode {
  switch (type) {
    case "air":
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="12,2 20,18 12,14 4,18" />
        </svg>
      );
    case "naval":
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="3" /><line x1="12" y1="11" x2="12" y2="20" />
          <path d="M6,17 Q12,23 18,17" /><line x1="8" y1="13" x2="16" y2="13" />
        </svg>
      );
    case "army":
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12,2 L22,8 L22,16 L12,22 L2,16 L2,8 Z" />
        </svg>
      );
    case "missile":
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="2" x2="12" y2="16" />
          <polygon points="8,16 12,22 16,16" fill="currentColor" />
          <line x1="8" y1="8" x2="12" y2="12" /><line x1="16" y1="8" x2="12" y2="12" />
        </svg>
      );
    case "nuclear":
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="9" />
          <line x1="12" y1="3" x2="12" y2="8" /><line x1="12" y1="16" x2="12" y2="21" />
          <line x1="3" y1="12" x2="8" y2="12" /><line x1="16" y1="12" x2="21" y2="12" />
        </svg>
      );
  }
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

function getSatelliteImageUrl(lat: number, lng: number, zoom: number, width: number, height: number): string {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${lng},${lat},${zoom},0/${width}x${height}@2x?access_token=${token}`;
}

export default function BaseCard({ base, map, onClose }: BaseCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const initialZoom = useRef(map.getZoom());
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isMobile = useIsMobile();
  const posRef = useRef({ x: 0, y: 0 });
  const flipLeftRef = useRef(false);
  const rafId = useRef(0);
  const [imgError, setImgError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const color = BASE_COLORS[base.operator];
  const operatorLabel = OPERATOR_LABELS[base.operator];
  const typeLabel = TYPE_LABELS[base.type];
  const typeDesc = TYPE_DESCRIPTIONS[base.type];
  const operatorDesc = OPERATOR_DESCRIPTIONS[base.operator];

  useEffect(() => {
    setImgError(false);
    setExpanded(false);
    initialZoom.current = map.getZoom();
  }, [base.name, map]);

  // Position update — direct DOM manipulation
  const updatePositionDOM = useCallback(() => {
    if (!cardRef.current) return;
    const point = map.project([base.lng, base.lat]);
    const container = map.getContainer();
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const wouldOverflowRight = point.x + CARD_OFFSET + CARD_WIDTH > containerWidth - 20;
    flipLeftRef.current = wouldOverflowRight;
    posRef.current = { x: point.x, y: point.y };

    const cardHeight = cardRef.current.offsetHeight || 300;
    let top = point.y - cardHeight / 2;
    top = Math.max(60, Math.min(top, containerHeight - cardHeight - 20));
    const left = wouldOverflowRight
      ? point.x - CARD_OFFSET - CARD_WIDTH
      : point.x + CARD_OFFSET;

    cardRef.current.style.left = `${left}px`;
    cardRef.current.style.top = `${top}px`;
  }, [map, base.lng, base.lat]);

  // Track map movement
  useEffect(() => {
    updatePositionDOM();

    const onMove = () => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(updatePositionDOM);
    };
    const onZoom = () => {
      if (map.getZoom() < initialZoom.current - 1.5) {
        onCloseRef.current();
      }
    };

    map.on("move", onMove);
    map.on("zoom", onZoom);
    return () => {
      cancelAnimationFrame(rafId.current);
      map.off("move", onMove);
      map.off("zoom", onZoom);
    };
  }, [map, updatePositionDOM]);

  const satUrl = getSatelliteImageUrl(base.lat, base.lng, 14, 400, 200);

  const cardBody = (
    <>
      {/* Satellite image */}
      <div className="border-b border-[#2a2a2a] bg-black relative overflow-hidden">
        {!imgError ? (
          <img
            src={satUrl}
            alt={`Satellite view of ${base.name}`}
            className="w-full h-[180px] object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-[180px] flex items-center justify-center bg-[#0e0e0e]">
            <span className="text-neutral-600 text-xs">Satellite image unavailable</span>
          </div>
        )}
        {/* Coords overlay on image */}
        <div className="absolute bottom-1.5 right-1.5 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] text-neutral-400 font-mono">
          {base.lat.toFixed(4)}, {base.lng.toFixed(4)}
        </div>
      </div>

      {/* Details */}
      <div className="overflow-y-auto overflow-x-hidden px-4 py-3 space-y-3 flex-1">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color }}
            >
              {operatorLabel}
            </span>
            <span
              className="text-[9px] font-bold uppercase px-1 py-0.5 rounded"
              style={{ color, background: `${color}20`, border: `1px solid ${color}30` }}
            >
              {typeLabel}
            </span>
          </div>
          <h2 className="text-sm font-semibold text-neutral-100 leading-tight">
            {base.name}
          </h2>
        </div>

        {/* Base Type Info */}
        <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span style={{ color }}>{getBaseTypeIcon(base.type)}</span>
            <span
              className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Facility Type
            </span>
          </div>
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            {typeDesc}
          </p>
        </div>

        {/* Operator Info */}
        <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: color, boxShadow: `0 0 6px ${color}80` }}
            />
            <span
              className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Operator
            </span>
          </div>
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            {expanded ? operatorDesc : operatorDesc.slice(0, 160) + (operatorDesc.length > 160 ? "..." : "")}
          </p>
          {operatorDesc.length > 160 && (
            <button
              onClick={() => setExpanded((p) => !p)}
              className="text-[10px] text-neutral-500 hover:text-neutral-300 mt-1"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>

        {/* Coordinates */}
        <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-3">
          <span
            className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider block mb-1.5"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Coordinates
          </span>
          <div className="flex items-center gap-4 text-[11px]">
            <div>
              <span className="text-neutral-600">LAT </span>
              <span className="text-neutral-300 font-medium">{base.lat.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-neutral-600">LNG </span>
              <span className="text-neutral-300 font-medium">{base.lng.toFixed(4)}</span>
            </div>
          </div>
        </div>

        {/* Google Maps link */}
        <div className="pt-2 border-t border-[#2a2a2a]">
          <a
            href={`https://www.google.com/maps/@${base.lat},${base.lng},2000m/data=!3m1!1e3`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
          >
            View on Google Maps ↗
          </a>
        </div>
      </div>
    </>
  );

  // Mobile: fullscreen panel
  if (isMobile) {
    return (
      <div className="fixed top-14 bottom-14 md:top-0 md:bottom-0 left-0 right-0 z-50 pointer-events-auto panel-enter w-full max-w-full overflow-hidden">
        <div
          ref={cardRef}
          className="bg-[#1a1a1a] shadow-[0_-8px_30px_rgba(0,0,0,0.7)] overflow-hidden h-full flex flex-col w-full"
        >
          <div className="shrink-0 bg-[#1a1a1a] pt-3 pb-2 px-4 flex items-center justify-between z-10 border-b border-[#2a2a2a]/50">
            <div className="flex items-center gap-2">
              <span style={{ color }}>{getBaseTypeIcon(base.type)}</span>
              <span className="text-sm font-semibold text-neutral-100">{base.name}</span>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center bg-black/60 rounded-full text-red-400 hover:text-red-300 text-base"
            >
              ✕
            </button>
          </div>
          {cardBody}
        </div>
      </div>
    );
  }

  // Desktop: marker-anchored card
  return (
    <div
      ref={cardRef}
      className="absolute z-50 pointer-events-auto"
      style={{ width: `${CARD_WIDTH}px` }}
    >
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.7)] overflow-hidden max-h-[70vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center bg-black/60 rounded-full text-red-400 hover:text-red-300 text-xs transition-colors"
        >
          ✕
        </button>
        {cardBody}
      </div>
    </div>
  );
}
