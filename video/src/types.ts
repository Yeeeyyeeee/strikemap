export interface StrikeMedia {
  videoPath: string;
  location?: string;
  weapon?: string;
  date?: string;
  timestamp?: string;
}

export interface StatsData {
  total_incidents: number;
  recent_24h: number;
  recent_7d: number;
  with_video: number;
  by_weapon: Record<string, number>;
  by_side: Record<string, number>;
  total_casualties_military: number;
  total_casualties_civilian: number;
}

export interface SfxPaths {
  impact: string;
  whoosh: string;
  alarm: string;
  siren: string;
  drone: string;
  riser: string;
  alert: string;
  tick: string;
}

export interface VoiceLines {
  open: string;
  detail?: string;
  stats?: string;
  cta: string;
}

export interface BreakingProps {
  location: string;
  weapon: string;
  strikeMedia?: StrikeMedia;
  mapScreenshot?: string;
  voiceLines: VoiceLines;
  sfx: SfxPaths;
  logo: string;
}

export interface DailyProps {
  stats: StatsData;
  strikeMedia: StrikeMedia[];
  mapScreenshot?: string;
  voiceLines: VoiceLines;
  sfx: SfxPaths;
  logo: string;
}

export interface WeaponsProps {
  weaponName: string;
  weaponCount: number | null;
  strikeMedia: StrikeMedia[];
  stats: StatsData;
  voiceLines: VoiceLines;
  sfx: SfxPaths;
  logo: string;
}

export interface LeadershipProps {
  leader?: string;
  leaderImage?: string;
  boardScreenshot?: string;
  stats: StatsData;
  voiceLines: VoiceLines;
  sfx: SfxPaths;
  logo: string;
}

export interface WeeklyProps {
  dateRange: string;
  stats: StatsData;
  strikeMedia: StrikeMedia[];
  mapScreenshot?: string;
  boardScreenshot?: string;
  heatmapScreenshot?: string;
  voiceLines: VoiceLines;
  sfx: SfxPaths;
  logo: string;
}
