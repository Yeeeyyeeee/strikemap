import React, { useRef, useEffect } from "react";
import { useCurrentFrame, AbsoluteFill } from "remotion";

interface Props {
  opacity?: number;
}

export const FilmGrain: React.FC<Props> = ({ opacity = 0.06 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    // Seeded random based on frame for deterministic grain
    let seed = frame * 9301 + 49297;
    const rand = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed & 0xffffff) / 0xffffff;
    };

    for (let i = 0; i < data.length; i += 4) {
      const v = Math.floor(rand() * 255);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }, [frame]);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 51, opacity }}>
      <canvas ref={canvasRef} width={270} height={480} style={{ width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
};
