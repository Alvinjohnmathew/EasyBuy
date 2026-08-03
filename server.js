const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cheerio = require('cheerio'); // Free HTML parsing library

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const catalogUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

/**
 * 100% FREE MRP Scraper using DuckDuckGo HTML + Cheerio
 */
async function scrapeFreeMRP(productTitle) {
  try {
    const query = encodeURIComponent(`${productTitle} price India MRP`);
    
    // Fetch search results page without any paid API keys
    const { data } = await axios.get(`https://html.duckduckgo.com/html/?q=${query}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 4000
    });

    const $ = cheerio.load(data);
    const snippets = $('.result__snippet').text();

    // Extract all prices found in snippet descriptions (e.g., ₹1,499 or Rs. 1500)
    const matches = snippets.match(/(?:₹|rs\.?\s*)\s*([\d,]+)/gi);
    
    if (matches && matches.length > 0) {
      const prices = matches
        .map(p => parseFloat(p.replace(/[^\d]/g, '')))
        .filter(p => !isNaN(p) && p > 0);

      if (prices.length > 0) {
        // Return highest found price to use as the MRP
        return Math.max(...prices);
      }
    }
  } catch (err) {
    console.log(`[Free Scraper] Could not fetch live web MRP for "${productTitle}". Using math fallback.`);
  }

  return null; // Triggers automatic mathematical backup if scraping yields nothing
}

/**
 * WhatsApp Catalog Processor
 */
async function parseAndProcessCatalog(catalogText, extractedImages = []) {
  const productBlocks = catalogText.split(/(?=\n\s*(?:Product|Item|Title|Name|₹|Rs)\b)/i);
  const processedProducts = [];

  for (let i = 0; i < productBlocks.length; i++) {
    const block = productBlocks[i].trim();
    if (!block) continue;

    // Extract Product Title
    const titleMatch = block.match(/^(?:Product|Item|Title|Name)?\s*[:\-]?\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : `Product ${i + 1}`;

    // Extract Base Price
    const priceMatch = block.match(/(?:price|rate|cost|selling|₹|rs\.?)\s*[:\-]?\s*([\d,]+)/i);
    let rawPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;

    if (!Number.isFinite(rawPrice) || rawPrice <= 0) continue;

    // 1. ADD ₹200 TO SELLING PRICE
    const sellingPrice = rawPrice + 200;

    // 2. SCRAPE REAL MRP ONLINE FOR FREE
    console.log(`Scraping online MRP for: "${title}"...`);
    const scrapedMRP = await scrapeFreeMRP(title);

    // 3. SET FINAL MRP (Must be greater than selling price)
    let finalMRP = scrapedMRP;
    if (!finalMRP || finalMRP <= sellingPrice) {
      // Fallback: 35% markup on selling price if web snippet returns no valid price
      finalMRP = Math.round(sellingPrice * 1.35);
    }

    // Default image array fallback
    const productImages = extractedImages.length > 0 
      ? extractedImages 
      : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=600'];

    processedProducts.push({
      title: title,
      description: block,
      price: sellingPrice,          // Selling price (+200)
      originalPrice: finalMRP,       // Scraped MRP or calculated fallback
      image: productImages[0],
      images: productImages
    });
  }

  return processedProducts;
}

// Endpoint
app.post('/api/admin/import-whatsapp-catalog/preview', catalogUpload.single('file'), async (req, res) => {
  try {
    const catalogText = req.body.text || '';
    if (!catalogText) {
      return res.status(400).json({ error: 'No catalog text provided.' });
    }

    const processedProducts = await parseAndProcessCatalog(catalogText);
    return res.status(200).json({ success: true, count: processedProducts.length, products: processedProducts });
  } catch (error) {
    return res.status(500).json({ error: 'Processing failed.' });
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));