/**
 * Client-safe Telegram utilities (no server-only imports).
 */

/**
 * Extract channel/postId from a Telegram URL.
 * Handles: https://t.me/channel/12345, https://t.me/s/channel/12345
 */
export function parseTelegramPostId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/t\.me\/(?:s\/)?(\w+)\/(\d+)/);
  return match ? `${match[1]}/${match[2]}` : null;
}

/**
 * Build a Telegram embed iframe URL for a given post ID.
 */
export function getTelegramEmbedUrl(postId: string): string {
  return `https://t.me/${postId}?embed=1&dark=1`;
}
