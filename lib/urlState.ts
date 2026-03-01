import { ViewMode } from "./types";

export interface ShareableState {
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  viewMode?: ViewMode;
  selectedId?: string;
}

export function encodeState(state: ShareableState): string {
  const params = new URLSearchParams();
  if (state.center) {
    params.set("c", `${state.center[0].toFixed(4)},${state.center[1].toFixed(4)}`);
  }
  if (state.zoom != null) {
    params.set("z", state.zoom.toFixed(1));
  }
  if (state.viewMode && state.viewMode !== "all") {
    params.set("v", state.viewMode);
  }
  if (state.selectedId) {
    params.set("id", state.selectedId);
  }
  return params.toString();
}

export function decodeState(search: string): ShareableState {
  const params = new URLSearchParams(search);
  const result: ShareableState = {};

  const c = params.get("c");
  if (c) {
    const [lng, lat] = c.split(",").map(Number);
    if (!isNaN(lng) && !isNaN(lat)) result.center = [lng, lat];
  }

  const z = params.get("z");
  if (z && !isNaN(parseFloat(z))) result.zoom = parseFloat(z);

  const v = params.get("v");
  if (v) result.viewMode = v as ViewMode;

  const id = params.get("id");
  if (id) result.selectedId = id;

  return result;
}
