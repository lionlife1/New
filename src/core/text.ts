export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Word-boundary regex that also treats apostrophes/hyphens inside names sensibly. */
export const wordRe = (word: string, flags = "gi") =>
  new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(word)}(?![\\p{L}\\p{N}_])`, flags + "u");
