// importer-utils.js — WhatsApp catalog import helpers
// Shared between server.js (Node) and the test suite.

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

function extractPriceValue(text) {
  const value = String(text || '');
  const priceMatch = value.match(/(?:price|selling price|offer price|rate|mrp|was|original)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*)/i)
    || value.match(/(?:₹|rs\.?|inr)\s*([0-9][0-9,]*)/i)
    || value.match(/\b([0-9]{2,6})\/?-?\b/);
  if (!priceMatch) return null;
  const maybeNumber = Number(String(priceMatch[1]).replace(/,/g, ''));
  return Number.isFinite(maybeNumber) && maybeNumber > 0 ? maybeNumber : null;
}

// ---------------------------------------------------------------------------
// BUG FIX: replaced isMeaningfulProductText (never existed) with this inline
// function throughout, fixing the ReferenceError that crashed all grouping.
// ---------------------------------------------------------------------------
function isMeaningfulTitleCandidate(value) {
  const line = String(value || '').trim();
  if (!line) return false;
  // Phone numbers: +91 73832 34749, 07383234749, +91 73832 34749: etc.
  if (/^\+?[\d][\d\s().\-]{4,}:?$/.test(line)) return false;
  // System/junk lines — keep in sync with server.js WA_SYSTEM_LINE_RE
  if (/^(?:available|dm|inbox|call|whatsapp|order now|book fast|missed voice|missed video|joined using invite link|messages deleted|media omitted|image omitted|video omitted|audio omitted|sticker omitted|gif omitted|end-to-end encryption|this message was deleted|forwarded)$/i.test(line)) return false;
  // Only punctuation / emojis
  if (/^[\W_]+$/.test(line)) return false;
  // Bare price lines: ₹291, Rs.299, 299/-
  if (/^(?:₹|rs\.?|inr)\s*[0-9,]+/i.test(line)) return false;
  if (/^price\s*:?\s*/.test(line) && /[0-9]/.test(line)) return false;
  const hasLetters = /[a-zA-Z]/.test(line);
  const hasProductWords = /(?:mobile|phone|watch|earbud|headphone|speaker|power\s*bank|powerbank|shirt|shoe|dress|bag|neckband|charger|camera|laptop|tablet|mug|gift|beauty|cream|serum|fan|lamp|keyboard|mouse|monitor|sandal|jacket|hoodie|kurti|saree|jeans|pant|trouser|top|blouse|lehenga|wallet|toy|teddy|bottle)/i.test(line);
  return hasLetters && (hasProductWords || line.split(/\s+/).length >= 2);
}

function chooseMeaningfulTitle(lines, fallback = 'WhatsApp product') {
  const candidates = Array.isArray(lines) ? lines : [lines];
  for (const line of candidates) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    const cleaned = trimmed
      .replace(/^(?:⭐|✨|🔷|📦|📱|🎧|👟|👕|🛍️|💄|🛒|🔥|📷|⚡|👇|🌟|💥|🔥|✅|➡️)\s*/gu, '')
      .replace(/^(?:new|latest|product|item)\s+/i, '')
      .trim();
    if (isMeaningfulTitleCandidate(cleaned)) return cleaned.slice(0, 220);
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// buildImportedProductGroups — the core grouping logic.
//
// BUGS FIXED:
//  1. `const hasImage` declared TWICE (lines 130 & 134) causing a syntax error.
//     Now declared once, before `hasMeaningfulContent`.
//  2. `isMeaningfulProductText` (undefined) replaced with `isMeaningfulTitleCandidate`.
//  3. `shouldBreak` no longer fires just because there is a second image for the
//     same product. Multiple images in a short window stay in the same group.
//  4. Final .filter() also used `isMeaningfulProductText` — fixed.
// ---------------------------------------------------------------------------
function buildImportedProductGroups(messages, imageEntries = []) {
  const groups = [];
  let currentGroup = null;

  const addGroup = (message) => {
    if (!currentGroup) {
      currentGroup = {
        title: '',
        descriptionLines: [],
        price: null,
        originalPrice: null,
        sku: '',
        brand: '',
        colour: '',
        size: '',
        category: '',
        images: [],
        timestamp: message.timestamp || null,
        sourceMessages: []
      };
    }

    currentGroup.sourceMessages.push(message);

    const text = String(message.text || '').trim();

    // Price extraction
    const price = extractPriceValue(text);
    if (price) {
      if (!currentGroup.price) {
        currentGroup.price = price;
      } else if (!currentGroup.originalPrice && currentGroup.price && price !== currentGroup.price) {
        // The higher of the two values is typically the MRP
        if (price > currentGroup.price) {
          currentGroup.originalPrice = price;
        } else {
          currentGroup.originalPrice = currentGroup.price;
          currentGroup.price = price;
        }
      }
    }

    // Title / description accumulation
    if (text && isMeaningfulTitleCandidate(text)) {
      const maybeTitle = chooseMeaningfulTitle([text], '');
      if (maybeTitle && !currentGroup.title) {
        currentGroup.title = maybeTitle;
      } else if (maybeTitle && currentGroup.title && maybeTitle !== currentGroup.title) {
        currentGroup.descriptionLines.push(text);
      } else if (!currentGroup.title) {
        currentGroup.descriptionLines.push(text);
      }
    }

    // Images
    if (message.images && message.images.length) {
      currentGroup.images.push(...message.images);
    }
  };

  messages.forEach((message, index) => {
    const text = String(message.text || '').trim();

    const hasImage = Array.isArray(message.images) && message.images.length > 0;
    const hasMeaningfulContent = isMeaningfulTitleCandidate(text) || hasImage;

    const previous = messages[index - 1];
    // BUG FIX: when timestamps are null/missing, treat as same-thread.
    // Previously timeDiffMs=0 fell into sameThread=true, but then logic
    // could still break groups via looksLikeNewTitle. Now we explicitly
    // treat missing-timestamp messages as always in the same thread.
    const bothHaveTimestamps = previous && previous.timestamp && message.timestamp;
    const timeDiffMs = bothHaveTimestamps
      ? (new Date(message.timestamp) - new Date(previous.timestamp))
      : -1; // -1 = "no info, assume same thread"
    const sameThread = timeDiffMs < 0 || (timeDiffMs >= 0 && timeDiffMs <= 5 * 60 * 1000);

    // --- Start a fresh group when no group is open ---
    if (!currentGroup) {
      if (!hasMeaningfulContent) return;
      addGroup(message);
      return;
    }

    // --- Decide whether this message belongs to the current group or a new one ---
    const candidateTitle = chooseMeaningfulTitle([text], '');

    // A message is a "new title" only when it looks like a different product name,
    // not when it is a price/MRP/availability line.
    const looksLikeNewTitle = Boolean(
      candidateTitle &&
      currentGroup.title &&
      candidateTitle !== currentGroup.title &&
      !/(?:price|mrp|₹|rs\.?|inr|available|dm|inbox|call|\d+\/?-)/i.test(text)
    );

    // Expanded system-line pattern — keep in sync with server.js WA_SYSTEM_LINE_RE
    const isSystemLine = /^(?:\+?[\d][\d\s().\-]{4,}:?|available|dm|inbox|call|whatsapp|order now|book fast|messages deleted|media omitted|image omitted|video omitted|audio omitted|sticker omitted|gif omitted|joined using invite link|missed voice call|missed video call|end-to-end encryption|this message was deleted|forwarded)$/i.test(text);

    const isSeparator = /^(?:[-=]{3,}|separator)$/i.test(text);

    const shouldBreak = !sameThread || isSeparator || looksLikeNewTitle;

    if (shouldBreak && (currentGroup.title || currentGroup.price || currentGroup.images.length || currentGroup.descriptionLines.length)) {
      groups.push(currentGroup);
      currentGroup = null;
      // System lines and bare separators don't start a new product group
      if (isSystemLine || isSeparator || !hasMeaningfulContent) return;
      addGroup(message);
      return;
    }

    // Skip pure system noise that adds nothing to the current group
    if (isSystemLine && !hasImage) return;

    addGroup(message);
  });

  if (currentGroup && (currentGroup.title || currentGroup.price || currentGroup.images.length || currentGroup.descriptionLines.length)) {
    groups.push(currentGroup);
  }

  return groups
    .map(group => {
      const title = chooseMeaningfulTitle([group.title, ...group.descriptionLines], 'WhatsApp product');
      const description = group.descriptionLines.filter(Boolean).join('\n').replace(/\n{2,}/g, '\n').trim();
      const cleanedDescription = description
        .replace(/\b(?:available|dm|inbox|call|whatsapp|order now|book fast)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        title,
        description: cleanedDescription || 'Imported from WhatsApp catalog.',
        price: group.price,
        originalPrice: group.originalPrice || group.price,
        images: Array.from(new Set((group.images || []).filter(Boolean)))
      };
    })
    // BUG FIX: replaced undefined `isMeaningfulProductText` with `isMeaningfulTitleCandidate`
    .filter(product => {
      const hasMeaningfulTitle = Boolean(
        product.title &&
        product.title !== 'WhatsApp product' &&
        isMeaningfulTitleCandidate(product.title)
      );
      const hasMeaningfulDescription = Boolean(
        product.description &&
        product.description !== 'Imported from WhatsApp catalog.' &&
        isMeaningfulTitleCandidate(product.description)
      );
      return hasMeaningfulTitle || hasMeaningfulDescription || product.images.length > 0;
    });
}

module.exports = {
  resolveImportWindowDays,
  calculateDuplicateScore,
  chooseMeaningfulTitle,
  buildImportedProductGroups,
  extractPriceValue
};
