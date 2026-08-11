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

function isMeaningfulTitleCandidate(value) {
  const line = String(value || '').trim();
  if (!line) return false;
  if (/^\+?\d[\d\s().-]{4,}$/.test(line)) return false;
  if (/^(?:available|dm|inbox|call|whatsapp|order now|book fast|missed voice|missed video|joined using invite link|messages deleted|media omitted|encryption messages)$/i.test(line)) return false;
  if (/^[\W_]+$/.test(line)) return false;
  if (/^(?:₹|rs\.?|inr)\s*[0-9,]+/.test(line)) return false;
  if (/^price\s*:??/.test(line)) return false;
  const hasLetters = /[a-zA-Z]/.test(line);
  const hasProductWords = /(?:mobile|phone|watch|earbud|headphone|speaker|power bank|powerbank|shirt|shoe|dress|bag|neckband|charger|camera|laptop|tablet|mug|gift|beauty|cream|serum|fan|lamp|keyboard|mouse|monitor|sandal|jacket|hoodie|kurti|saree|jeans|pant|trouser|top|blouse|lehenga|wallet|toy|teddy|bottle)/i.test(line);
  return hasLetters && (hasProductWords || line.split(/\s+/).length >= 2);
}

function chooseMeaningfulTitle(lines, fallback = 'WhatsApp product') {
  const candidates = Array.isArray(lines) ? lines : [lines];
  for (const line of candidates) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    const cleaned = trimmed
      .replace(/^(?:⭐|✨|🔷|📦|📱|🎧|👟|👕|🛍️|💄|🛒|🔥)\s*/u, '')
      .replace(/^(?:new|latest|product|item)\s+/i, '')
      .trim();
    if (isMeaningfulTitleCandidate(cleaned)) return cleaned.slice(0, 220);
  }
  return fallback;
}

function buildImportedProductGroups(messages, imageEntries = []) {
  const groups = [];
  let currentGroup = null;

  const isMeaningfulText = (text, hasImage = false) => isMeaningfulProductText(text, hasImage);

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
    const price = extractPriceValue(text);
    if (price) {
      if (!currentGroup.price) {
        currentGroup.price = price;
      } else if (!currentGroup.originalPrice && currentGroup.price && price !== currentGroup.price) {
        currentGroup.originalPrice = price;
      }
    }

    if (text && isMeaningfulText(text)) {
      const maybeTitle = chooseMeaningfulTitle([text], '');
      if (maybeTitle && !currentGroup.title) {
        currentGroup.title = maybeTitle;
      } else if (maybeTitle && currentGroup.title && maybeTitle !== currentGroup.title) {
        currentGroup.descriptionLines.push(text);
      } else if (!currentGroup.title) {
        currentGroup.descriptionLines.push(text);
      }
    }

    if (message.images && message.images.length) {
      currentGroup.images.push(...message.images);
    }
  };

  messages.forEach((message, index) => {
    const text = String(message.text || '').trim();
    const hasMeaningfulContent = isMeaningfulText(text, hasImage);
    const hasImage = Array.isArray(message.images) && message.images.length > 0;
    const previous = messages[index - 1];
    const sameThread = previous && currentGroup && previous.timestamp && message.timestamp && (message.timestamp - previous.timestamp) <= 5 * 60 * 1000;

    const hasImage = Array.isArray(message.images) && message.images.length > 0;
    if (!currentGroup) {
      if (!isMeaningfulText(text, hasImage)) return;
      addGroup(message);
      return;
    }

    const candidateTitle = chooseMeaningfulTitle([text], '');
  const looksLikeNewTitle = Boolean(candidateTitle && currentGroup.title && candidateTitle !== currentGroup.title && !/price|mrp|₹|rs\.?|inr/i.test(text));
  const shouldBreak = !sameThread || /^(?:[-=]{3,}|separator)$/i.test(text) || (hasMeaningfulContent && /^(?:\+?\d[\d\s().-]{4,}|available|dm|inbox|call|whatsapp|order now|book fast|messages deleted|media omitted|joined using invite link|missed voice|missed video|encryption messages)$/i.test(text)) || looksLikeNewTitle || (hasImage && currentGroup.images.length > 0 && currentGroup.title);

    if (shouldBreak && (currentGroup.title || currentGroup.price || currentGroup.images.length || currentGroup.descriptionLines.length)) {
      groups.push(currentGroup);
      currentGroup = null;
      addGroup(message);
      return;
    }

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
    .filter(product => {
      const hasMeaningfulTitle = Boolean(product.title && product.title !== 'WhatsApp product' && isMeaningfulProductText(product.title));
      const hasMeaningfulDescription = Boolean(product.description && product.description !== 'Imported from WhatsApp catalog.' && isMeaningfulProductText(product.description));
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
