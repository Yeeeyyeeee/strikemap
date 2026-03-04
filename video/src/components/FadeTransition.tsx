import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, AbsoluteFill } from "remotion";

interface Props {
  fadeInFrames?: number;
  fadeOutFrames?: number;
  children: React.ReactNode;
}

export const FadeTransition: React.FC<Props> = ({
  fadeInFrames = 9,
  fadeOutFrames = 15,
  children,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, fadeInFrames], [0, 1], {
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [durationInFrames - fadeOutFrames, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });

  return <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>{children}</AbsoluteFill>;
};
