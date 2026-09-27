require('dotenv').config();
const fetch = require('node-fetch');

/**
 * Construct a prompt that forces the model to output strict JSON matching the required schema.
 */
function buildPrompt(caption) {
  const schema = {
    productName: "",
    brand: "",
    category: "",
    subcategory: "",
    description: "",
    features: [],
    offer: "",
    shipping: "",
    whatsappPrice: null,
    mrp: null,
    priceSource: "",
    priceConflict: false,
    confidence: 0
  };
  return `You are a product‑extraction assistant.
Given the following WhatsApp caption and ONE OR MORE product images, extract **STRICT JSON** that matches this exact schema (all fields must be present, do NOT add extra fields or any explanatory text):
${JSON.stringify(schema, null, 2)}

**RULES**
- Analyse the actual product images first; use the caption only as supplementary information.
- Extract the product name, brand/model, category and sub‑category if possible.
- Produce a short e‑commerce description and a list of visible features.
- Detect any offer text (e.g., "Buy 1 Get 1 Free") and shipping info (e.g., "Free shipping").
- Detect the selling price (₹) from the caption or from the image. If both exist and differ, set "priceConflict": true and "priceSource": "both". If only caption provides it -> "priceSource": "caption", if only image provides it -> "priceSource": "image", otherwise "priceSource": "unknown".
- Detect MRP only if it is clearly visible on the image or explicitly stated in the caption. Never invent an MRP – set it to null otherwise.
- If a price cannot be found, set "whatsappPrice": null and "priceSource": "unknown".
- Set "confidence" to an integer 0‑100 representing how confident you are overall (you can approximate).
- **Do NOT hallucinate specifications or numbers that are not present in the image or caption.**

**CAPTION**:\n${caption}\n**END OF CAPTION**

Respond ONLY with the JSON object, nothing else.`;
}

/**
 * Calls the Ollama vision model.
 * Returns {valid:true,data:<json>} on success or {valid:false,error:<msg>} on failure.
 */
async function extractProductInfo({ images, caption }) {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const model = process.env.OLLAMA_MODEL || 'qwen2.5vl:3b';
  const prompt = buildPrompt(caption);

  try {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Ollama expects the images as an array of base64 strings (no data URI prefix)
      body: JSON.stringify({ model, prompt, images, stream: false })
    });
    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }
    const result = await response.json();
    const raw = typeof result.response === 'string' ? result.response : (result.response && result.response[0]) || '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new Error('No JSON object found in Ollama response');
    }
    const jsonString = raw.substring(start, end + 1);
    const parsed = JSON.parse(jsonString);
    return { valid: true, data: parsed };
  } catch (err) {
    console.error('AI extraction error:', err.message);
    return { valid: false, error: err.message };
  }
}

module.exports = { extractProductInfo };
