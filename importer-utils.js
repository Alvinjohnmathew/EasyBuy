function resolveImportWindowDays(value, fallback = 30) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(365, Math.round(parsed)));
}

function normalizeForComparison(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

function calculateDuplicateScore(candidate, existing) {
  const candidateTokens = normalizeForComparison(candidate.title || candidate.description || '');
  const existingTokens = normalizeForComparison(existing.title || existing.description || '');
  const tokenOverlap = candidateTokens.filter(token => existingTokens.includes(token)).length;
  const tokenUnion = new Set([...candidateTokens, ...existingTokens]).size;
  const tokenScore = tokenUnion === 0 ? 0 : tokenOverlap / tokenUnion;

  const titleScore = String(candidate.title || '').trim() && String(existing.title || '').trim()
    ? (String(candidate.title || '').toLowerCase() === String(existing.title || '').toLowerCase() ? 1 : 0)
    : 0;

  const categoryScore = String(candidate.category || '').trim() && String(existing.category || '').trim()
    ? (String(candidate.category || '').toLowerCase() === String(existing.category || '').toLowerCase() ? 1 : 0)
    : 0;

  const imageNameScore = Array.isArray(candidate.imageNames) && Array.isArray(existing.images)
    ? (candidate.imageNames.some(name => existing.images.some(image => String(image || '').includes(String(name || '').replace(/\.[^.]+$/, '')))) ? 1 : 0)
    : 0;

  return Math.max(tokenScore, titleScore * 0.8, categoryScore * 0.7, imageNameScore * 0.9);
}

module.exports = {
  resolveImportWindowDays,
  calculateDuplicateScore
};
