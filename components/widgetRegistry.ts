export interface WidgetDef {
  id: string;
  label: string;
  description: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  resizable: boolean;
  defaultPosition: { x: number; y: number };
  /** If set, widget has an explicit height (otherwise auto-height from content) */
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  /** Position relative to right edge instead of left */
  anchorRight?: boolean;
  /** Allow multiple instances of this widget */
  multiInstance?: boolean;
}

/** Extract the base widget ID, stripping any instance suffix (e.g. "currentcam:2" → "currentcam") */
export function getBaseWidgetId(id: string): string {
  const idx = id.indexOf(":");
  return idx === -1 ? id : id.slice(0, idx);
}

// Default layout: two columns with gaps calculated from rendered widget heights.
// Column 1 (x=16): escalation (~217px), currentcam (~176px), airspace (145-311px variable, at bottom so it can expand freely)
// Column 2 (x=240): accuracy-iran (~189px), accuracy-us (~189px), casualties (~203px), clock (~119px)
// All positions snap to the 16px grid.
export const WIDGET_REGISTRY: WidgetDef[] = [
  {
    id: "escalation",
    label: "Escalation Meter",
    description: "Conflict escalation level",
    defaultWidth: 208,
    minWidth: 180,
    maxWidth: 320,
    resizable: false,
    defaultPosition: { x: 16, y: 80 },
  },
  {
    id: "currentcam",
    label: "Live Cam",
    description: "Live video stream",
    defaultWidth: 208,
    minWidth: 208,
    maxWidth: 640,
    resizable: true,
    defaultPosition: { x: 16, y: 320 },
    multiInstance: true,
  },
  {
    id: "airspace",
    label: "Airspace Status",
    description: "Regional airspace NOTAMs",
    defaultWidth: 208,
    minWidth: 180,
    maxWidth: 320,
    resizable: false,
    defaultPosition: { x: 16, y: 528 },
  },
  {
    id: "accuracy-iran",
    label: "Iran Accuracy",
    description: "Iran strike accuracy gauge",
    defaultWidth: 208,
    minWidth: 180,
    maxWidth: 320,
    resizable: false,
    defaultPosition: { x: 240, y: 80 },
  },
  {
    id: "accuracy-us",
    label: "US/Israel Accuracy",
    description: "US/Israel strike accuracy",
    defaultWidth: 208,
    minWidth: 180,
    maxWidth: 320,
    resizable: false,
    defaultPosition: { x: 240, y: 288 },
  },
  {
    id: "casualties",
    label: "Casualties",
    description: "Casualty tracker",
    defaultWidth: 272,
    minWidth: 240,
    maxWidth: 400,
    resizable: true,
    defaultPosition: { x: 240, y: 496 },
  },
  {
    id: "clock",
    label: "Conflict Clock",
    description: "Time since last strike",
    defaultWidth: 256,
    minWidth: 220,
    maxWidth: 400,
    resizable: false,
    defaultPosition: { x: 240, y: 720 },
  },
  {
    id: "strike-counter",
    label: "Strike Counter",
    description: "Strike totals & breakdown",
    defaultWidth: 208,
    minWidth: 180,
    maxWidth: 320,
    resizable: false,
    defaultPosition: { x: 464, y: 80 },
  },
  {
    id: "cyber-status",
    label: "Cyber Status",
    description: "Internet connectivity monitor",
    defaultWidth: 208,
    minWidth: 180,
    maxWidth: 320,
    resizable: false,
    defaultPosition: { x: 464, y: 288 },
  },
  {
    id: "feed",
    label: "Live Feed",
    description: "Real-time Telegram feed",
    defaultWidth: 320,
    minWidth: 240,
    maxWidth: 600,
    resizable: true,
    defaultHeight: 500,
    minHeight: 200,
    maxHeight: 900,
    anchorRight: true,
    defaultPosition: { x: 16, y: 440 },
  },
];

export const WIDGET_MAP = Object.fromEntries(WIDGET_REGISTRY.map((w) => [w.id, w]));

export const DEFAULT_ACTIVE_WIDGETS = WIDGET_REGISTRY.map((w) => w.id);
