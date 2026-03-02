/**
 * Shared video URL utilities.
 */

/** Extract YouTube video ID from various URL formats (watch, embed, live, short) */
export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]+)/
  );
  return match ? match[1] : null;
}

/** Build a YouTube embed URL from a video URL. Returns null if not a YouTube URL. */
export function getYouTubeEmbedUrl(url: string): string | null {
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

/** Check if a URL points to a directly-playable video file (Telegram CDN, mp4, etc.) */
export function isDirectVideoUrl(url: string): boolean {
  if (!url) return false;
  return (
    url.includes("telesco.pe") ||
    url.includes("telegram") ||
    url.includes("cdn") ||
    /\.(mp4|webm|mov)(\?|$)/i.test(url)
  );
}
