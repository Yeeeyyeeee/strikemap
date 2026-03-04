"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { Incident } from "@/lib/types";
import { playBRRTSound } from "@/lib/sounds";

interface A10OverlayProps {
  incident: Incident | null;
  map: mapboxgl.Map | null;
  soundEnabled?: boolean;
}

// Top-down A-10 Thunderbolt II — traced from reference, nose pointing right
const A10_SVG = `<svg viewBox="0 0 120 60" width="120" height="60" xmlns="http://www.w3.org/2000/svg">
  <!-- Main fuselage — long narrow body -->
  <path d="M14 27.5 L30 27 L60 26.5 L80 26 L95 27 L105 29 L108 30 L105 31 L95 33 L80 34 L60 33.5 L30 33 L14 32.5 L10 30 Z"
        fill="#6d7a85" stroke="#4a5560" stroke-width="0.5"/>

  <!-- Wings — straight, unswept, constant chord, squared tips -->
  <!-- Top wing -->
  <path d="M53 26.5 L51 6 L50 4.5 L49 4 L68 4 L69 4.5 L68 6 L66 26.5"
        fill="#5f6d77" stroke="#4a5560" stroke-width="0.5"/>
  <!-- Bottom wing -->
  <path d="M53 33.5 L51 54 L50 55.5 L49 56 L68 56 L69 55.5 L68 54 L66 33.5"
        fill="#5f6d77" stroke="#4a5560" stroke-width="0.5"/>
  <!-- Trailing edge flaps (top wing) -->
  <path d="M66 6 L68 6 L69 4.5 L68 4 L66 4 L65 6 Z" fill="#536069" stroke="#4a5560" stroke-width="0.3"/>
  <path d="M56 6 L57 4 L63 4 L62 6 Z" fill="#536069" stroke="#4a5560" stroke-width="0.3"/>
  <!-- Trailing edge flaps (bottom wing) -->
  <path d="M66 54 L68 54 L69 55.5 L68 56 L66 56 L65 54 Z" fill="#536069" stroke="#4a5560" stroke-width="0.3"/>
  <path d="M56 54 L57 56 L63 56 L62 54 Z" fill="#536069" stroke="#4a5560" stroke-width="0.3"/>

  <!-- Wing hardpoints with pylons — 5 per side -->
  <!-- Top wing stores -->
  <line x1="54" y1="8" x2="54" y2="12" stroke="#4a5560" stroke-width="0.6"/>
  <path d="M52.5 8 L55.5 8 L55 7 L53 7 Z" fill="#5a6670" stroke="#4a5560" stroke-width="0.3"/>
  <line x1="57" y1="7" x2="57" y2="11" stroke="#4a5560" stroke-width="0.6"/>
  <path d="M55.5 7 L58.5 7 L58 6 L56 6 Z" fill="#5a6670" stroke="#4a5560" stroke-width="0.3"/>
  <line x1="60" y1="6.5" x2="60" y2="10" stroke="#4a5560" stroke-width="0.6"/>
  <path d="M58.5 6.5 L61.5 6.5 L61 5.5 L59 5.5 Z" fill="#5a6670" stroke="#4a5560" stroke-width="0.3"/>
  <line x1="63" y1="6" x2="63" y2="9.5" stroke="#4a5560" stroke-width="0.6"/>
  <ellipse cx="63" cy="5.5" rx="1.3" ry="0.8" fill="#5a6670" stroke="#4a5560" stroke-width="0.3"/>
  <line x1="55.5" y1="15" x2="55.5" y2="19" stroke="#4a5560" stroke-width="0.5"/>
  <ellipse cx="55.5" cy="14.5" rx="1" ry="0.7" fill="#5a6670"/>
  <!-- Bottom wing stores (mirrored) -->
  <line x1="54" y1="48" x2="54" y2="52" stroke="#4a5560" stroke-width="0.6"/>
  <path d="M52.5 52 L55.5 52 L55 53 L53 53 Z" fill="#5a6670" stroke="#4a5560" stroke-width="0.3"/>
  <line x1="57" y1="49" x2="57" y2="53" stroke="#4a5560" stroke-width="0.6"/>
  <path d="M55.5 53 L58.5 53 L58 54 L56 54 Z" fill="#5a6670" stroke="#4a5560" stroke-width="0.3"/>
  <line x1="60" y1="50" x2="60" y2="53.5" stroke="#4a5560" stroke-width="0.6"/>
  <path d="M58.5 53.5 L61.5 53.5 L61 54.5 L59 54.5 Z" fill="#5a6670" stroke="#4a5560" stroke-width="0.3"/>
  <line x1="63" y1="51" x2="63" y2="54" stroke="#4a5560" stroke-width="0.6"/>
  <ellipse cx="63" cy="54.5" rx="1.3" ry="0.8" fill="#5a6670" stroke="#4a5560" stroke-width="0.3"/>
  <line x1="55.5" y1="41" x2="55.5" y2="45" stroke="#4a5560" stroke-width="0.5"/>
  <ellipse cx="55.5" cy="45.5" rx="1" ry="0.7" fill="#5a6670"/>

  <!-- Engine nacelles — large, rear-mounted, the A-10's signature -->
  <!-- Top engine -->
  <path d="M20 14 C20 11, 23 10, 26 10 L36 10 C39 10, 40 11, 40 14 L40 20 C40 22, 39 23, 36 23 L26 23 C23 23, 20 22, 20 20 Z"
        fill="#566068" stroke="#414b53" stroke-width="0.5"/>
  <!-- Bottom engine -->
  <path d="M20 40 C20 37, 23 37, 26 37 L36 37 C39 37, 40 38, 40 40 L40 46 C40 49, 39 50, 36 50 L26 50 C23 50, 20 49, 20 46 Z"
        fill="#566068" stroke="#414b53" stroke-width="0.5"/>
  <!-- Engine intake faces -->
  <path d="M39 11 C41 11, 42 13, 42 15 L42 19 C42 21, 41 23, 39 23 L39 11 Z" fill="#49535b" stroke="#3d464e" stroke-width="0.3"/>
  <path d="M39 37 C41 37, 42 39, 42 41 L42 45 C42 47, 41 49, 39 49 L39 37 Z" fill="#49535b" stroke="#3d464e" stroke-width="0.3"/>
  <!-- Engine exhaust nozzles -->
  <ellipse cx="20" cy="17" rx="2" ry="3.5" fill="#3a4148" stroke="#2e363d" stroke-width="0.4"/>
  <ellipse cx="20" cy="17" rx="1" ry="2" fill="#2e363d"/>
  <ellipse cx="20" cy="43" rx="2" ry="3.5" fill="#3a4148" stroke="#2e363d" stroke-width="0.4"/>
  <ellipse cx="20" cy="43" rx="1" ry="2" fill="#2e363d"/>
  <!-- Engine pylons to fuselage -->
  <path d="M32 23 L34 27 L30 27 L28 23 Z" fill="#5a6470" stroke="#4a5560" stroke-width="0.3"/>
  <path d="M32 37 L34 33 L30 33 L28 37 Z" fill="#5a6470" stroke="#4a5560" stroke-width="0.3"/>
  <!-- Engine internal detail lines -->
  <line x1="25" y1="11" x2="25" y2="23" stroke="#4a535b" stroke-width="0.3" opacity="0.4"/>
  <line x1="32" y1="10.5" x2="32" y2="23" stroke="#4a535b" stroke-width="0.3" opacity="0.4"/>
  <line x1="25" y1="37" x2="25" y2="49" stroke="#4a535b" stroke-width="0.3" opacity="0.4"/>
  <line x1="32" y1="37" x2="32" y2="49.5" stroke="#4a535b" stroke-width="0.3" opacity="0.4"/>

  <!-- Horizontal stabilizer — swept, extends beyond engines -->
  <path d="M10 30 L4 14 L5 12.5 L7 12 L16 13.5 L18 14.5 L14 27"
        fill="#5f6d77" stroke="#4a5560" stroke-width="0.4"/>
  <path d="M10 30 L4 46 L5 47.5 L7 48 L16 46.5 L18 45.5 L14 33"
        fill="#5f6d77" stroke="#4a5560" stroke-width="0.4"/>
  <!-- Twin vertical stabilizers at stab tips -->
  <rect x="5" y="10" width="6" height="3" rx="0.8" fill="#4e5963" stroke="#3d474f" stroke-width="0.4"/>
  <rect x="5" y="47" width="6" height="3" rx="0.8" fill="#4e5963" stroke="#3d474f" stroke-width="0.4"/>

  <!-- Cockpit canopy — bubble shape -->
  <path d="M93 28 L99 29 L103 29.5 L105 30 L103 30.5 L99 31 L93 32 L91 30 Z"
        fill="#152d48" stroke="#4499ff" stroke-width="0.6" opacity="0.9"/>
  <!-- Canopy frame lines -->
  <line x1="96" y1="28.8" x2="96" y2="31.2" stroke="#4499ff" stroke-width="0.25" opacity="0.5"/>
  <line x1="100" y1="29.3" x2="100" y2="30.7" stroke="#4499ff" stroke-width="0.25" opacity="0.5"/>
  <!-- Windscreen glint -->
  <path d="M98 29.3 L102 29.7 L100 30.2 Z" fill="#66bbff" opacity="0.25"/>

  <!-- GAU-8 Avenger cannon — offset below centerline like the real aircraft -->
  <line x1="108" y1="30.5" x2="118" y2="30.5" stroke="#3a4148" stroke-width="2" stroke-linecap="round"/>
  <line x1="108" y1="30.5" x2="118" y2="30.5" stroke="#4f5960" stroke-width="1" stroke-linecap="round"/>
  <!-- Gun port housing -->
  <ellipse cx="108" cy="30.5" rx="1.5" ry="2" fill="#4a5560" stroke="#3d474f" stroke-width="0.3"/>

  <!-- Fuselage panel lines -->
  <line x1="45" y1="27" x2="45" y2="33" stroke="#58636d" stroke-width="0.25" opacity="0.35"/>
  <line x1="75" y1="26.5" x2="75" y2="33.5" stroke="#58636d" stroke-width="0.25" opacity="0.35"/>
  <!-- Spine detail -->
  <line x1="30" y1="30" x2="90" y2="30" stroke="#58636d" stroke-width="0.2" opacity="0.2"/>

  <!-- USAF roundels (subtle) -->
  <circle cx="58" cy="14" r="2.8" fill="none" stroke="#fff" stroke-width="0.35" opacity="0.15"/>
  <circle cx="58" cy="14" r="1.2" fill="#3b82f6" opacity="0.15"/>
  <circle cx="58" cy="46" r="2.8" fill="none" stroke="#fff" stroke-width="0.35" opacity="0.15"/>
  <circle cx="58" cy="46" r="1.2" fill="#3b82f6" opacity="0.15"/>
</svg>`;

/** Quadratic Bezier point at parameter t */
function bezier(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/** Quadratic Bezier tangent angle at parameter t */
function bezierAngle(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
) {
  const mt = 1 - t;
  const dx = 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const dy = 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
  return Math.atan2(dy, dx);
}

/** Build SVG path string for a quadratic Bezier trail */
function bezierPath(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
) {
  return `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
}

export default function A10Overlay({ incident, map, soundEnabled = true }: A10OverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!incident || !map || !containerRef.current || activeRef.current) return;

    const container = containerRef.current;
    activeRef.current = true;

    // A-10 approach: enter from left side of screen, strafe target, exit right side
    // Entry close (west), exit far (east) — target reached early, then quick fly-off
    const entryCoord: [number, number] = [incident.lng - 3, incident.lat + 1];
    const exitCoord: [number, number] = [incident.lng + 10, incident.lat - 3];
    const targetCoord: [number, number] = [incident.lng, incident.lat];

    // Target is near the entry so it's reached early (~0.25)
    const tClosest = 0.25;

    // Create A-10 trail (blue dashed line showing flight path)
    const trailSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    trailSvg.style.position = "absolute";
    trailSvg.style.inset = "0";
    trailSvg.style.width = "100%";
    trailSvg.style.height = "100%";
    trailSvg.style.pointerEvents = "none";
    trailSvg.style.overflow = "visible";
    const trailPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    trailPath.setAttribute("fill", "none");
    trailPath.setAttribute("stroke", "#4af");
    trailPath.setAttribute("stroke-width", "1.5");
    trailPath.setAttribute("stroke-dasharray", "6 4");
    trailPath.setAttribute("opacity", "0.4");
    trailSvg.appendChild(trailPath);
    container.appendChild(trailSvg);

    // Create A-10 element
    const a10 = document.createElement("div");
    a10.className = "a10-warthog";
    a10.innerHTML = A10_SVG;
    container.appendChild(a10);

    // Muzzle flash at the target
    const flash = document.createElement("div");
    flash.className = "a10-muzzle-flash";
    flash.style.display = "none";
    container.appendChild(flash);

    // Tracer sparks container
    const tracers = document.createElement("div");
    tracers.className = "a10-tracers";
    tracers.style.display = "none";
    container.appendChild(tracers);

    const flightDuration = 3000; // Faster — 3s total, target hit at ~0.75s then quick exit
    const startTime = performance.now();
    let brrtPlayed = false;

    function animate(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / flightDuration, 1);

      // Reproject lat/lng → screen pixels every frame so it follows map pan/zoom
      const entryPt = map!.project(entryCoord);
      const exitPt = map!.project(exitCoord);
      const targetPt = map!.project(targetCoord);

      // Control point: slightly above the midpoint for a very low arc (strafing run)
      const midX = (entryPt.x + exitPt.x) / 2;
      const midY = (entryPt.y + exitPt.y) / 2;
      const dist = Math.sqrt((exitPt.x - entryPt.x) ** 2 + (exitPt.y - entryPt.y) ** 2);
      const arcHeight = Math.min(dist * 0.1, 50);
      const ctrl = { x: midX, y: midY - arcHeight };

      // Position A-10 along the map-projected Bezier curve
      const pos = bezier(t, entryPt, ctrl, exitPt);
      const angle = bezierAngle(t, entryPt, ctrl, exitPt);
      a10.style.transform = `translate(${pos.x - 60}px, ${pos.y - 30}px) rotate(${angle}rad)`;

      // Update trail (draw path up to current position)
      const pathD = bezierPath(entryPt, ctrl, exitPt);
      trailPath.setAttribute("d", pathD);
      const totalLen = (trailPath as SVGPathElement).getTotalLength?.() || dist;
      trailPath.setAttribute("stroke-dasharray", `${totalLen * t} ${totalLen}`);

      // Update muzzle flash position to follow map
      flash.style.left = `${targetPt.x}px`;
      flash.style.top = `${targetPt.y}px`;

      // BRRT when passing over target
      const brrtStart = tClosest - 0.08;
      if (!brrtPlayed && t >= brrtStart) {
        brrtPlayed = true;
        if (soundEnabled) playBRRTSound();
        flash.style.display = "block";

        // Tracer sparks along strafing line near target
        tracers.style.display = "block";
        const brrtAngle = bezierAngle(tClosest, entryPt, ctrl, exitPt);
        const cosA = Math.cos(brrtAngle);
        const sinA = Math.sin(brrtAngle);
        for (let i = 0; i < 8; i++) {
          const spark = document.createElement("div");
          spark.className = "a10-tracer-spark";
          const offset = (i - 4) * 16;
          const sparkX = targetPt.x + cosA * offset + (Math.random() - 0.5) * 16;
          const sparkY = targetPt.y + sinA * offset + (Math.random() - 0.5) * 16;
          spark.style.left = `${sparkX}px`;
          spark.style.top = `${sparkY}px`;
          spark.style.animationDelay = `${i * 0.05}s`;
          tracers.appendChild(spark);
        }

        setTimeout(() => {
          flash.style.display = "none";
          tracers.style.display = "none";
          tracers.innerHTML = "";
        }, 1000);
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // Fade out trail then cleanup
        trailPath.setAttribute("opacity", "0");
        setTimeout(() => {
          a10.remove();
          flash.remove();
          tracers.remove();
          trailSvg.remove();
          activeRef.current = false;
        }, 500);
      }
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      a10.remove();
      flash.remove();
      tracers.remove();
      trailSvg.remove();
      activeRef.current = false;
    };
  }, [incident, map, soundEnabled]);

  return <div ref={containerRef} className="a10-overlay" />;
}
