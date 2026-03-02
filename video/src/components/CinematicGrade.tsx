import React from "react";
import { AbsoluteFill } from "remotion";
import { Vignette } from "./Vignette";
import { FilmGrain } from "./FilmGrain";

interface Props {
  children: React.ReactNode;
}

export const CinematicGrade: React.FC<Props> = ({ children }) => {
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          filter: "contrast(1.1) brightness(0.95) saturate(0.9)",
        }}
      >
        {children}
      </AbsoluteFill>
      <Vignette />
      <FilmGrain opacity={0.05} />
    </AbsoluteFill>
  );
};
