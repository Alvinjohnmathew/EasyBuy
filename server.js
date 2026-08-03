const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Multer Setup for File & ZIP Uploads (50MB Limit)
const catalogUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

/**
 * 100% Free Scraper using DuckDuckGo + Cheerio
 * Scrapes live search snippets to estimate the actual MRP of a product.
 */
async function scrapeFreeMRP(productTitle) {
  try {
    const cleanTitle = productTitle.replace(/[^\w\s]/gi, '').trim();
    const query = encodeURIComponent(`${cleanTitle} price India MRP`);
    
    const { data } = await axios.get(`https://html.duckduckgo.com/html/?q=${query}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 4000
    });

    const $ = cheerio.load(data);
    const snippets = $('.result__snippet').text();

    // Extract price matches (e.g., ₹1,499 or Rs. 1500)
    const matches = snippets.match(/(?:₹|rs\.?\s*)\s*([\d,]+)/gi);
    
    if (matches && matches.length > 0) {
      const prices = matches
        .map(p => parseFloat(p.replace(/[^\d]/g, '')))
        .filter(p => !isNaN(p) && p > 0);

      if (prices.length > 0) {
        // Return highest found price in search results as the MRP
        return Math.max(...prices);
      }
    }
  } catch (err) {
    console.log(`[Free Scraper] Web search skipped for "${productTitle}". Using math fallback.`);
  }

  return null; // Triggers fallback markup calculation if scraping yields no result
}

/**
 * Parses raw WhatsApp catalog text, adds +₹200 markup to selling price,
 * and scrapes online MRP for the original price field.
 */
async function parseAndProcessCatalog(catalogText, extractedImages = []) {
  // Split catalog into individual product blocks
  const productBlocks = catalogText.split(/(?=\n\s*(?:Product|Item|Title|Name|₹|Rs)\b)/i);
  const processedProducts = [];

  for (let i = 0; i < productBlocks.length; i++) {
    const block = productBlocks[i].trim();
    if (!block) continue;

    // 1. Extract Title
    const titleMatch = block.match(/^(?:Product|Item|Title|Name)?\s*[:\-]?\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : `Product ${i + 1}`;

    // 2. Extract Base Selling Price
    const priceMatch = block.match(/(?:price|rate|cost|selling|₹|rs\.?)\s*[:\-]?\s*([\d,]+)/i);
    let rawPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;

    if (!Number.isFinite(rawPrice) || rawPrice <= 0) continue;

    // --- RULE: ADD ₹200 TO SELLING PRICE ---
    const sellingPrice = rawPrice + 200;

    // --- RULE: SCRAPE ONLINE MRP ---
    console.log(`Searching online MRP for: "${title}"...`);
    const scrapedMRP = await scrapeFreeMRP(title);

    // Calculate final MRP (ensure it's greater than the selling price)
    let finalMRP = scrapedMRP;
    if (!finalMRP || finalMRP <= sellingPrice) {
      // Fallback: 35% markup over selling price if online lookup fails
      finalMRP = Math.round(sellingPrice * 1.35); 
    }

    // 3. Fallback default images
    const defaultImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=600';
    const productImages = extractedImages.length > 0 ? extractedImages : [defaultImage];

    processedProducts.push({
      title: title,
      description: block,
      price: sellingPrice,          // Selling price (+200 markup)
      originalPrice: finalMRP,       // Scraped or calculated original MRP
      image: productImages[0],
      images: productImages
    });
  }

  return processedProducts;
}

// API Endpoint: Import and Preview WhatsApp Catalog
app.post('/api/admin/import-whatsapp-catalog/preview', catalogUpload.single('file'), async (req, res) => {
  try {
    const catalogText = req.body.text || '';
    if (!catalogText.trim()) {
      return res.status(400).json({ success: false, error: 'No catalog text provided.' });
    }

    const processedProducts = await parseAndProcessCatalog(catalogText);

    return res.status(200).json({
      success: true,
      count: processedProducts.length,
      products: processedProducts
    });

  } catch (error) {
    console.error('Error importing WhatsApp catalog:', error);
    return res.status(500).json({ success: false, error: 'Failed to process WhatsApp catalog.' });
  }
});

// Explicit Routes for HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start Express Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});