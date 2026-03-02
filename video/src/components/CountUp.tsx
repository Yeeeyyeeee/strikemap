import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { COLOR_TEXT, FONT_MONO } from "../brand";

interface Props {
  target: number;
  startFrame?: number;
  durationFrames?: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  style?: React.CSSProperties;
}

export const CountUp: React.FC<Props> = ({
  target,
  startFrame = 0,
  durationFrames = 45,
  fontSize = 38,
  color = COLOR_TEXT,
  fontFamily = FONT_MONO,
  style,
}) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;

  if (localFrame < 0) return null;

  const progress = interpolate(localFrame, [0, durationFrames], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const value = Math.floor(progress * target);

  return (
    <div
      style={{
        fontSize,
        color,
        fontFamily,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      {value.toLocaleString()}
    </div>
  );
};
