// Brand constants — mirrors scripts/video/lib/brand.sh

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;

// Colors
export const COLOR_BG = "#0a0a0a";
export const COLOR_BG_SECONDARY = "#111111";
export const COLOR_PANEL = "#1a1a1a";
export const COLOR_BORDER = "#2a2a2a";
export const COLOR_TEXT = "#e5e5e5";
export const COLOR_TEXT_SECONDARY = "#999999";
export const COLOR_ACCENT = "#ef4444";
export const COLOR_ACCENT_ORANGE = "#f97316";
export const COLOR_WHITE = "#ffffff";

// Font families (loaded via @font-face in global.css)
export const FONT_BOLD = "Inter-Bold, Inter, sans-serif";
export const FONT_SEMIBOLD = "Inter-SemiBold, Inter, sans-serif";
export const FONT_REGULAR = "Inter-Regular, Inter, sans-serif";
export const FONT_MONO = "JetBrainsMono-Bold, JetBrains Mono, monospace";

// Pacing (seconds)
export const HOOK_DURATION = 1.5;
export const SCENE_SHORT = 3;
export const SCENE_MEDIUM = 4;
export const SCENE_LONG = 5;
export const CTA_DURATION = 2.5;

// Helper: seconds to frames
export const sec = (s: number) => Math.round(s * FPS);
