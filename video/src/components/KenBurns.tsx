import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Img } from "remotion";

type Direction = "zoom_in" | "zoom_out" | "pan_right" | "pan_left";

interface Props {
  src: string;
  direction?: Direction;
  style?: React.CSSProperties;
}

export const KenBurns: React.FC<Props> = ({
  src,
  direction = "zoom_in",
  style,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
  });

  let scale: number;
  let translateX = 0;
  let translateY = 0;

  switch (direction) {
    case "zoom_in":
      scale = 1 + progress * 0.3;
      break;
    case "zoom_out":
      scale = 1.3 - progress * 0.3;
      break;
    case "pan_right":
      scale = 1.2;
      translateX = -progress * 100;
      break;
    case "pan_left":
      scale = 1.2;
      translateX = -(1 - progress) * 100;
      break;
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...style,
      }}
    >
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
        }}
      />
    </div>
  );
};
