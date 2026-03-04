/**
 * Text-similarity based deduplication for feed posts.
 * Removes near-duplicate posts (same news reported by different channels
 * or slightly reworded reposts).
 */

/**
 * Normalize text for comparison: lowercase, strip emoji/URLs/punctuation,
 * collapse whitespace.
 */
function normalize(text: string): string {
  return (
    text
      .toLowerCase()
      // Strip URLs
      .replace(/https?:\/\/\S+/g, "")
      // Strip emoji and symbols

      .replace(
        /[^\x00-\x7F\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u0400-\u04FF\u4E00-\u9FFF\uAC00-\uD7AF]/g,
        ""
      )
      // Strip punctuation but keep letters/digits/spaces from all scripts
      .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u0400-\u04FF]/g, " ")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Extract character trigrams from text.
 */
function trigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i <= text.length - 3; i++) {
    set.add(text.slice(i, i + 3));
  }
  return set;
}

/**
 * Compute Jaccard similarity between two trigram sets (0–1).
 */
export function trigramSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);

  // Very short texts: fall back to substring check
  if (na.length < 12 || nb.length < 12) {
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.95;
    return 0;
  }

  const ta = trigrams(na);
  const tb = trigrams(nb);

  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }

  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Check if one text is largely contained within another (for updates/edits).
 */
function containsSimilar(longer: string, shorter: string): boolean {
  const nl = normalize(longer);
  const ns = normalize(shorter);
  if (ns.length < 15) return false;
  return nl.includes(ns) || ns.includes(nl);
}

interface FeedPost {
  id: string;
  text: string;
  timestamp: string;
  imageUrls?: string[];
  videoUrl?: string;
}

/**
 * Deduplicate feed posts by text similarity.
 * Groups near-duplicate posts and keeps the best one per group:
 * - Prefer posts with more text (more informative)
 * - Prefer posts with media (images/video)
 * - Preserve chronological order of the kept posts
 *
 * @param posts - Pre-sorted by timestamp descending
 * @param threshold - Similarity threshold (0–1), default 0.55
 */
export function deduplicatePosts<T extends FeedPost>(posts: T[], threshold = 0.55): T[] {
  if (posts.length <= 1) return posts;

  // Track which posts are suppressed (index → true)
  const suppressed = new Set<number>();

  for (let i = 0; i < posts.length; i++) {
    if (suppressed.has(i)) continue;

    // Only compare against a nearby window (posts within ~30 min)
    // to keep O(n) manageable and avoid false matches on distant posts
    for (let j = i + 1; j < posts.length; j++) {
      if (suppressed.has(j)) continue;

      // Time window check — skip if posts are more than 60 min apart
      const ti = new Date(posts[i].timestamp).getTime();
      const tj = new Date(posts[j].timestamp).getTime();
      if (Math.abs(ti - tj) > 60 * 60 * 1000) continue;

      const sim = trigramSimilarity(posts[i].text, posts[j].text);
      const contained = containsSimilar(posts[i].text, posts[j].text);

      if (sim >= threshold || contained) {
        // Keep the "better" post — more text, or has media
        const scoreI = postScore(posts[i]);
        const scoreJ = postScore(posts[j]);

        if (scoreI >= scoreJ) {
          suppressed.add(j);
        } else {
          suppressed.add(i);
          break; // i is suppressed, move to next i
        }
      }
    }
  }

  return posts.filter((_, idx) => !suppressed.has(idx));
}

/**
 * Score a post for quality — higher = keep this one over duplicates.
 */
function postScore(post: FeedPost): number {
  let score = normalize(post.text).length; // Longer text = more info
  if (post.videoUrl) score += 50;
  if (post.imageUrls && post.imageUrls.length > 0) score += 30;
  return score;
}
