require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { extractProductInfo } = require('../services/product-ai');

/**
 * Helper to format price values (₹) nicely.
 */
function formatPrice(val) {
  return val != null ? `₹${val}` : 'N/A';
}

async function main() {
  const [,, imagePath, ...captionParts] = process.argv;
  if (!imagePath || captionParts.length === 0) {
    console.error('Usage: node test-product.js <IMAGE_PATH> <CAPTION>');
    process.exit(1);
  }
  const caption = captionParts.join(' ');
  const absoluteImg = path.resolve(imagePath);
  if (!fs.existsSync(absoluteImg)) {
    console.error('Image file not found:', absoluteImg);
    process.exit(1);
  }

  // Read image and convert to base64 string
  const imgBuffer = fs.readFileSync(absoluteImg);
  const base64 = imgBuffer.toString('base64');

  console.log('→ Sending image and caption to Ollama...');
  const result = await extractProductInfo({ images: [base64], caption });

  if (!result.valid) {
    console.error('❌ AI extraction failed:', result.error);
    process.exit(1);
  }

  const data = result.data;
  // Compute EasyBuy price = whatsappPrice + 200 (if price exists)
  const easyBuyPrice = data.whatsappPrice != null ? Number(data.whatsappPrice) + 200 : null;

  console.log('\n=== Extracted Product Information ===');
  console.log('Product Name   :', data.productName || 'N/A');
  console.log('Brand/Model    :', data.brand || 'N/A');
  console.log('Category       :', data.category || 'N/A');
  console.log('Subcategory    :', data.subcategory || 'N/A');
  console.log('Description    :', data.description || 'N/A');
  console.log('Features       :', Array.isArray(data.features) ? data.features.join(', ') : 'N/A');
  console.log('Offer          :', data.offer || 'N/A');
  console.log('Shipping       :', data.shipping || 'N/A');
  console.log('WhatsApp Price :', formatPrice(data.whatsappPrice));
  console.log('EasyBuy Price  :', formatPrice(easyBuyPrice));
  console.log('MRP            :', formatPrice(data.mrp));
  console.log('Price Source   :', data.priceSource || 'unknown');
  console.log('Price Conflict :', data.priceConflict);
  console.log('Confidence     :', data.confidence);
  console.log('-------------------------------------');
}

main();
