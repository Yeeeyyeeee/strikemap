import React from "react";
import { useCurrentFrame, interpolate, AbsoluteFill } from "remotion";
import { COLOR_ACCENT, COLOR_WHITE } from "../brand";

interface Props {
  durationFrames?: number;
}

export const RedFlash: React.FC<Props> = ({ durationFrames = 9 }) => {
  const frame = useCurrentFrame();

  if (frame >= durationFrames) return null;

  // Frame 0-1: white blast, then red fade-out
  const isWhite = frame < 2;
  const opacity = isWhite
    ? 1
    : interpolate(frame, [2, durationFrames], [0.9, 0], {
        extrapolateRight: "clamp",
      });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: isWhite ? COLOR_WHITE : COLOR_ACCENT,
        opacity,
        zIndex: 100,
      }}
    />
  );
};
