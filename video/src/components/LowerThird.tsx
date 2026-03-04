import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import {
  COLOR_BG,
  COLOR_ACCENT,
  COLOR_TEXT,
  COLOR_TEXT_SECONDARY,
  FONT_BOLD,
  FONT_SEMIBOLD,
  FONT_MONO,
} from "../brand";

interface Props {
  location: string;
  weapon?: string;
  timestamp?: string;
  startFrame?: number;
}

export const LowerThird: React.FC<Props> = ({ location, weapon, timestamp, startFrame = 9 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;

  if (localFrame < 0) return null;

  // Bar wipes in (width animation)
  const barProgress = spring({
    fps,
    frame: localFrame,
    config: { damping: 20, mass: 1, stiffness: 100 },
  });
  const barWidth = interpolate(barProgress, [0, 1], [0, 1080]);

  // Location slides up (delayed 6 frames)
  const locFrame = Math.max(0, localFrame - 6);
  const locProgress = spring({
    fps,
    frame: locFrame,
    config: { damping: 14, mass: 0.8, stiffness: 130 },
  });
  const locY = interpolate(locProgress, [0, 1], [80, 0]);
  const locOpacity = interpolate(locFrame, [0, 6], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Weapon fades in (delayed 12 frames)
  const wpnOpacity =
    localFrame > 12
      ? interpolate(localFrame - 12, [0, 9], [0, 1], {
          extrapolateRight: "clamp",
        })
      : 0;

  // Time fades in (delayed 18 frames)
  const timeOpacity =
    localFrame > 18
      ? interpolate(localFrame - 18, [0, 9], [0, 1], {
          extrapolateRight: "clamp",
        })
      : 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        height: 280,
        overflow: "hidden",
      }}
    >
      {/* Dark bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: barWidth,
          height: 280,
          backgroundColor: `${COLOR_BG}dd`,
        }}
      />
      {/* Red accent line */}
      {localFrame > 6 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 3,
            backgroundColor: COLOR_ACCENT,
          }}
        />
      )}
      {/* Location */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 60,
          fontSize: 48,
          fontFamily: FONT_BOLD,
          fontWeight: 700,
          color: COLOR_ACCENT,
          transform: `translateY(${locY}px)`,
          opacity: locOpacity,
        }}
      >
        {location}
      </div>
      {/* Weapon */}
      {weapon && (
        <div
          style={{
            position: "absolute",
            top: 80,
            left: 60,
            fontSize: 28,
            fontFamily: FONT_SEMIBOLD,
            fontWeight: 600,
            color: COLOR_TEXT,
            opacity: wpnOpacity,
          }}
        >
          {weapon}
        </div>
      )}
      {/* Timestamp */}
      {timestamp && (
        <div
          style={{
            position: "absolute",
            top: 120,
            left: 60,
            fontSize: 22,
            fontFamily: FONT_MONO,
            color: COLOR_TEXT_SECONDARY,
            opacity: timeOpacity,
          }}
        >
          {timestamp}
        </div>
      )}
    </div>
  );
};
