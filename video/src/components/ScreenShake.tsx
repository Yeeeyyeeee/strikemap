import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

interface Props {
  startFrame?: number;
  durationFrames?: number;
  intensity?: number;
  children: React.ReactNode;
}

export const ScreenShake: React.FC<Props> = ({
  startFrame = 0,
  durationFrames = 12,
  intensity = 15,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;
  const endFrame = durationFrames;

  let dx = 0;
  let dy = 0;

  if (localFrame >= 0 && localFrame < endFrame) {
    const t = localFrame / fps;
    const decay = Math.exp(-t * 8);
    dx = intensity * Math.sin(localFrame * 2.5) * decay;
    dy = intensity * Math.cos(localFrame * 2.1) * decay;
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: `translate(${dx}px, ${dy}px)`,
      }}
    >
      {children}
    </div>
  );
};
