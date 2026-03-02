import React from "react";
import { Img, staticFile } from "remotion";

interface Props {
  logo?: string;
}

export const Watermark: React.FC<Props> = ({ logo = "icon.png" }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 60,
        right: 40,
        width: 80,
        height: 80,
        opacity: 0.6,
        zIndex: 90,
      }}
    >
      <Img
        src={staticFile(logo)}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
  );
};
