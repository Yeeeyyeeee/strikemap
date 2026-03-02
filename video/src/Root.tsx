import { Composition } from "remotion";
import { WIDTH, HEIGHT, FPS, sec } from "./brand";
import { Breaking } from "./compositions/Breaking";
import "./styles/global.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BreakingComp = Breaking as React.FC<any>;

const defaultSfx = {
  impact: "sfx/impact.wav",
  whoosh: "sfx/whoosh.wav",
  alarm: "sfx/alarm.wav",
  siren: "sfx/siren.wav",
  drone: "sfx/drone.wav",
  riser: "sfx/riser.wav",
  alert: "sfx/alert.wav",
  tick: "sfx/tick.wav",
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Breaking"
        component={BreakingComp}
        durationInFrames={sec(14)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          location: "Tehran",
          weapon: "JDAM",
          voiceLines: {
            open: "sfx/voice/breaking_open.wav",
            detail: "sfx/voice/breaking_detail.wav",
            cta: "sfx/voice/breaking_cta.wav",
          },
          sfx: defaultSfx,
          logo: "icon.png",
        }}
      />
    </>
  );
};
