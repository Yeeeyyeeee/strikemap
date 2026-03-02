import { AbsoluteFill } from "remotion";
import { COLOR_BG, COLOR_ACCENT, COLOR_TEXT, FONT_BOLD } from "../brand";
import type { BreakingProps } from "../types";

export const Breaking: React.FC<BreakingProps> = ({ location, weapon }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLOR_BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          color: COLOR_ACCENT,
          fontSize: 96,
          fontFamily: FONT_BOLD,
          fontWeight: 700,
        }}
      >
        BREAKING
      </div>
      <div
        style={{
          color: COLOR_TEXT,
          fontSize: 36,
          fontFamily: FONT_BOLD,
          marginTop: 20,
        }}
      >
        {location} - {weapon}
      </div>
    </AbsoluteFill>
  );
};
