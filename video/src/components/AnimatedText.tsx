import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
} from "remotion";
import { COLOR_TEXT, FONT_BOLD } from "../brand";

type Animation =
  | "pop"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "fadeIn"
  | "typewriter";

interface Props {
  text: string;
  animation: Animation;
  startFrame?: number;
  durationFrames?: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number;
  x?: number | string;
  y?: number;
  style?: React.CSSProperties;
}

export const AnimatedText: React.FC<Props> = ({
  text,
  animation,
  startFrame = 0,
  durationFrames = 15,
  fontSize = 48,
  color = COLOR_TEXT,
  fontFamily = FONT_BOLD,
  fontWeight = 700,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;

  if (localFrame < 0) return null;

  const baseStyle: React.CSSProperties = {
    fontSize,
    color,
    fontFamily,
    fontWeight,
    whiteSpace: "nowrap",
    ...style,
  };

  if (animation === "pop") {
    const scale = spring({
      fps,
      frame: localFrame,
      config: { damping: 12, mass: 0.8, stiffness: 200 },
    });
    const opacity = interpolate(localFrame, [0, 4], [0, 1], {
      extrapolateRight: "clamp",
    });
    return (
      <div
        style={{
          ...baseStyle,
          transform: `scale(${scale})`,
          opacity,
        }}
      >
        {text}
      </div>
    );
  }

  if (animation === "slideLeft") {
    const progress = spring({
      fps,
      frame: localFrame,
      config: { damping: 15, mass: 0.8, stiffness: 120 },
    });
    const x = interpolate(progress, [0, 1], [-600, 0]);
    const opacity = interpolate(localFrame, [0, 6], [0, 1], {
      extrapolateRight: "clamp",
    });
    return (
      <div
        style={{
          ...baseStyle,
          transform: `translateX(${x}px)`,
          opacity,
        }}
      >
        {text}
      </div>
    );
  }

  if (animation === "slideRight") {
    const progress = spring({
      fps,
      frame: localFrame,
      config: { damping: 15, mass: 0.8, stiffness: 120 },
    });
    const x = interpolate(progress, [0, 1], [600, 0]);
    const opacity = interpolate(localFrame, [0, 6], [0, 1], {
      extrapolateRight: "clamp",
    });
    return (
      <div
        style={{
          ...baseStyle,
          transform: `translateX(${x}px)`,
          opacity,
        }}
      >
        {text}
      </div>
    );
  }

  if (animation === "slideUp") {
    const progress = spring({
      fps,
      frame: localFrame,
      config: { damping: 14, mass: 0.8, stiffness: 130 },
    });
    const y = interpolate(progress, [0, 1], [120, 0]);
    const opacity = interpolate(localFrame, [0, 6], [0, 1], {
      extrapolateRight: "clamp",
    });
    return (
      <div
        style={{
          ...baseStyle,
          transform: `translateY(${y}px)`,
          opacity,
        }}
      >
        {text}
      </div>
    );
  }

  if (animation === "typewriter") {
    const charsVisible = Math.min(
      text.length,
      Math.floor(localFrame / 2) + 1
    );
    return (
      <div style={baseStyle}>{text.slice(0, charsVisible)}</div>
    );
  }

  // fadeIn
  const opacity = interpolate(localFrame, [0, durationFrames], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ ...baseStyle, opacity }}>
      {text}
    </div>
  );
};
