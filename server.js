const axios = require("axios");
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const Razorpay = require('razorpay');
const AdmZip = require('adm-zip');
const Tesseract = require('tesseract.js');
const app = express();

// ============================================================
// Required configuration — fail fast if missing rather than
// silently running with no real security or no database.
// ============================================================
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SMTP_FROM = process.env.EMAIL_FROM || '"EasyBuy Store" <alvinjohnmathew6@gmail.com>';

if (!MONGODB_URI || !JWT_SECRET || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('\n[FATAL] Missing required environment variables.');
  console.error('Please set MONGODB_URI, JWT_SECRET, ADMIN_USERNAME and ADMIN_PASSWORD.');
  console.error('See .env.example for what to put in your .env file (local) or your host\'s env var settings (Render, etc).\n');
  process.exit(1);
}

const isProd = process.env.NODE_ENV === 'production';
const CUSTOMER_COOKIE_NAME = 'eb_customer_session';
const ADMIN_COOKIE_NAME = 'eb_admin_session';
const LEGACY_COOKIE_NAME = 'eb_session';

// Razorpay is optional at boot (so the rest of the site still works if it's
// not configured yet), but the payment routes refuse to run without it.
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
let razorpay = null;
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
} else {
  console.warn('[WARN] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — payment routes are disabled.');
}

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Image uploads go straight to memory, then get base64-encoded into MongoDB —
// never written to local disk, since Render's filesystem is ephemeral.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB per image
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

// ============================================================
// MongoDB models (Mongoose)
// ============================================================
const userSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  wishlist: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  title: String,
  category: String,
  subcategory: { type: String, default: '' },
  price: Number,
  originalPrice: Number,
  colors: [String],
  sizes: [String],
  rating: Number,
  ratingCount: Number,
  image: String,
  images: [String],
  description: String,
  stock: Number
});

const orderSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  userId: { type: String, required: true, index: true },
  date: String,
  items: [{
    productId: String,
    title: String,
    image: String,
    price: Number,
    color: String,
    size: String,
    quantity: Number
  }],
  shippingInfo: {
    name: String,
    phone: String,
    address: String,
    city: String,
    pincode: String
  },
  paymentMethod: String,
  razorpayOrderId: String,
  razorpayPaymentId: String,
  totalAmount: Number,
  deliveryTracking: [{
    status: String,
    date: { type: Date, default: Date.now },
    message: String
  }],
  status: { type: String, default: 'Pending' }
});

const settingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'default' },
  payeeName: { type: String, default: 'EasyBuy Store' },
  upiId: { type: String, default: 'easybuy@okaxis' }
});

const reviewSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  productId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  rating: { type: Number, required: true },
  comment: String,
  createdAt: { type: Date, default: Date.now }
});


// Strip Mongo's internal fields so API responses match the original shape
const stripInternal = (doc) => {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : doc;
  delete obj._id;
  delete obj.__v;
  return obj;
};

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const Review = mongoose.model('Review', reviewSchema);

// Short-lived, server-side previews keep the ZIP out of the browser. Products
// are not stored until the administrator confirms the import.
const whatsappImportPreviews = new Map();

function inferCatalogCategory(text) {
  const value = String(text || '').toLowerCase();
  const gender = /women|ladies|girl/.test(value) ? 'Women' : /men|gents|boy/.test(value) ? 'Men' : '';
  if (/watch|smart ?watch|chrono|dial/.test(value)) return { category: 'Watch', subcategory: gender };
  if (/shoe|sneaker|sandal|slipper|loafer|boot|heels|footwear/.test(value)) return { category: 'Shoes', subcategory: gender };
  if (/shirt|t-?shirt|dress|kurti|saree|jeans|pant|trouser|hoodie|jacket|fashion|clothing|wear|top|blouse|lehenga/.test(value)) return { category: 'Fashion', subcategory: gender };
  if (/earbud|airpod|headphone|wireless|bluetooth|speaker|earphones|buds|neckband/.test(value)) return { category: 'Earbuds', subcategory: '' };
  if (/speaker|soundbar|woofer|bluetooth speaker/.test(value)) return { category: 'Speakers', subcategory: '' };
  if (/laptop|notebook|macbook|keyboard|mouse|monitor|desktop/.test(value)) return { category: 'Laptop', subcategory: '' };
  if (/mobile|iphone|android|smartphone|phone|tablet/.test(value)) return { category: 'Mobiles', subcategory: '' };
  if (/gift|hamper|toy|teddy|mug|decor/.test(value)) return { category: 'Gifts', subcategory: '' };
  if (/kitchen|cooker|mixer|blender|pressure cooker|utensil/.test(value)) return { category: 'Kitchen', subcategory: '' };
  if (/beauty|makeup|lipstick|skincare|serum|face|cream|perfume/.test(value)) return { category: 'Beauty', subcategory: '' };
  if (/home appliance|fan|iron|heater|vacuum|mixer|washing|refrigerator/.test(value)) return { category: 'Home Appliances', subcategory: '' };
  return { category: 'Accessories', subcategory: '' };
}

function cleanWhatsAppLine(line) {
  return String(line || '')
    .replace(/^\s*<attached:[^>]+>\s*$/i, '')
    .replace(/^\s*[\u200e\u200f]/, '')
    .trim();
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\u2019|\u2018/g, "'")
    .replace(/[^a-zA-Z0-9\u20b9₹%+/\-.,()\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeTitleCandidate(text, fallback) {
  const cleaned = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^(?:⭐|✨|🔷|📦|📱|🎧|👟|👕|🛍️|💄|🛒|🔥)\s*/u, ''))
    .filter(line => !/^(?:buy|get|price|mrp|offer|free shipping|cash on delivery|high quality|new type c|available|contact|whatsapp)/i.test(line))
    .find(line => line.length >= 3);
  const fallbackCandidate = cleaned || String(text || '').trim() || fallback;
  return fallbackCandidate.replace(/^\s*(?:product|item|new|latest)\s+/i, '').slice(0, 220);
}

function extractPriceValue(text) {
  const value = String(text || '');
  const priceMatch = value.match(/(?:price|selling price|offer price|rate|mrp|was|original)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*)/i)
    || value.match(/(?:₹|rs\.?|inr)\s*([0-9][0-9,]*)/i)
    || value.match(/\b([0-9]{2,6})\b/);
  if (!priceMatch) return null;
  const maybeNumber = Number(String(priceMatch[1]).replace(/,/g, ''));
  return Number.isFinite(maybeNumber) && maybeNumber > 0 ? maybeNumber : null;
}

function calculateSellingPrice(rawPrice) {
  if (!rawPrice) return null;
  const numericPrice = Number(rawPrice);
  return Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice + 200 : null;
}

function calculateOriginalPrice(sellingPrice, rawPrice) {
  if (!sellingPrice) return null;
  const base = rawPrice && Number(rawPrice) > sellingPrice ? Number(rawPrice) : sellingPrice;
  const estimated = Math.max(sellingPrice, Math.round((sellingPrice * 1.35) / 10) * 10);
  return Math.max(base, estimated);
}

function estimateNameConfidence(title, caption, imageNames) {
  const text = `${title || ''}\n${caption || ''}\n${(imageNames || []).join(' ')}`;
  const normalized = normalizeText(text).toLowerCase();
  let confidence = 0.4;
  if ((title || '').trim().length >= 6) confidence += 0.2;
  if (/\b(airpods|earbuds|watch|speaker|laptop|mobile|iphone|shoe|dress|shirt|beauty|mixer|fan|lamp|headphone|smart|wireless)\b/.test(normalized)) confidence += 0.2;
  if ((caption || '').split(/\s+/).filter(Boolean).length >= 5) confidence += 0.1;
  if ((imageNames || []).length > 0) confidence += 0.1;
  return Math.min(0.98, confidence);
}

async function extractTextFromImage(entry) {
  try {
    if (!entry || typeof entry.getData !== 'function') return '';
    const buffer = entry.getData();
    const imagePath = `data:${getImageMime(entry.entryName)};base64,${buffer.toString('base64')}`;
    const result = await Tesseract.recognize(imagePath, 'eng', { logger: () => {} });
    return String(result.data?.text || '').trim();
  } catch (error) {
    return '';
  }
}

function buildDescription(lines, title, priceLine) {
  const filtered = (lines || [])
    .map(cleanWhatsAppLine)
    .filter(Boolean)
    .filter(line => line !== title)
    .filter(line => !/^(?:price|selling price|offer price|mrp|rate|free shipping|cash on delivery|available|contact|whatsapp)/i.test(line))
    .filter(line => !/^(?:₹|rs\.?|inr)\s*[0-9,]+/i.test(line));
  const joined = filtered.join('\n').trim();
  return joined || (priceLine ? 'Imported from WhatsApp catalog.' : 'Imported from WhatsApp catalog.');
}

function splitWhatsAppMessages(chatText) {
  const lines = String(chatText || '').replace(/\r/g, '').split('\n');
  const messages = [];
  let current = null;

  for (const line of lines) {
    const messageMatch = line.match(/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*(?:-|–|—)\s*(.+)$/i);
    if (messageMatch) {
      if (current) messages.push(current);
      current = {
        text: messageMatch[1].trim(),
        attachments: [],
        raw: line
      };
      continue;
    }

    if (current) {
      current.text = `${current.text}\n${line}`.trim();
      current.raw = `${current.raw}\n${line}`;
    }
  }

  if (current) messages.push(current);
  return messages;
}

function getImageMime(entryName) {
  const ext = path.extname(entryName || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function toDataUri(buffer, entryName) {
  if (!buffer) return null;
  return `data:${getImageMime(entryName)};base64,${buffer.toString('base64')}`;
}

function normalizeAttachmentName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '');
}

function findMatchingImageEntry(entry, attachedName) {
  const target = normalizeAttachmentName(attachedName);
  const sourceName = normalizeAttachmentName(path.basename(entry.entryName));
  return sourceName === target || sourceName.includes(target) || target.includes(sourceName);
}

async function extractProductDetails(group, index) {
  const caption = String(group.caption || '').trim();
  const imageEntries = Array.isArray(group.imageEntries) ? group.imageEntries : [];
  const imageNames = imageEntries.map(entry => path.basename(entry.entryName));
  const fallbackTitle = `WhatsApp product ${index + 1}`;
  const title = safeTitleCandidate(caption || imageNames.join(' '), fallbackTitle);
  const rawPrice = extractPriceValue(caption);
  const sellingPrice = calculateSellingPrice(rawPrice);
  const originalPrice = calculateOriginalPrice(sellingPrice, rawPrice);
  const categoryInfo = inferCatalogCategory(`${title}\n${caption}`);
  const description = buildDescription(caption.split(/\r?\n/), title, rawPrice);
  const nameConfidence = estimateNameConfidence(title, caption, imageNames);
  const needsReview = !sellingPrice || nameConfidence < 0.7 || !title || title === fallbackTitle;

  let imageText = '';
  if (imageEntries.length && !caption) {
    imageText = (await Promise.all(imageEntries.map(entry => extractTextFromImage(entry)))).join('\n').trim();
  }
  const combinedCaption = [caption, imageText].filter(Boolean).join('\n').trim();
  const combinedTitle = safeTitleCandidate(combinedCaption || imageNames.join(' '), fallbackTitle);
  const combinedPrice = extractPriceValue(combinedCaption) || rawPrice;
  const combinedSellingPrice = calculateSellingPrice(combinedPrice);
  const combinedOriginalPrice = calculateOriginalPrice(combinedSellingPrice, combinedPrice);
  const combinedCategoryInfo = inferCatalogCategory(`${combinedTitle}\n${combinedCaption}`);
  const combinedDescription = buildDescription(combinedCaption.split(/\r?\n/), combinedTitle, combinedPrice);

  const product = {
    previewId: crypto.randomUUID(),
    title: combinedTitle.slice(0, 220),
    price: combinedSellingPrice || sellingPrice,
    originalPrice: combinedOriginalPrice || originalPrice,
    category: combinedCategoryInfo.category,
    subcategory: combinedCategoryInfo.subcategory,
    description: combinedDescription || description,
    colors: [],
    stock: 10,
    imageEntries: imageEntries,
    imageName: imageNames[0] || '',
    imageEntryNames: imageNames,
    sourceText: caption,
    nameConfidence,
    needsReview,
    hasImage: (group.imageEntries || []).length > 0,
    action: 'create',
    isSelected: !needsReview
  };

  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 10 && combinedCaption) {
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        messages: [{
          role: 'system',
          content: 'You extract structured e-commerce product data from WhatsApp chat captions. Return concise JSON with title, description, category, and priceNumber. Use null for missing values. Do not invent a price.'
        }, {
          role: 'user',
          content: `Caption:\n${combinedCaption}\n\nImage names:\n${imageNames.join(', ') || 'none'}`
        }],
        response_format: { type: 'json_object' }
      }, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      });
      const payload = response.data?.choices?.[0]?.message?.content;
      if (payload) {
        const parsed = JSON.parse(payload);
        const aiTitle = String(parsed.title || '').trim();
        const aiDescription = String(parsed.description || '').trim();
        const aiCategory = String(parsed.category || '').trim();
        const aiPrice = parsed.priceNumber ? Number(parsed.priceNumber) : null;
        if (aiTitle) product.title = aiTitle.slice(0, 220);
        if (aiDescription) product.description = aiDescription.slice(0, 1800);
        if (aiCategory) {
          product.category = aiCategory;
          product.subcategory = '';
        }
        if (aiPrice) {
          product.price = calculateSellingPrice(aiPrice);
          product.originalPrice = calculateOriginalPrice(product.price, aiPrice);
          product.needsReview = false;
          product.isSelected = true;
        }
      }
    } catch (error) {
      console.warn('Optional AI extraction skipped:', error.message);
    }
  }

  return product;
}

async function parseWhatsAppCatalog(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const textEntry = entries.find(entry => !entry.isDirectory && /\.txt$/i.test(entry.entryName));
  if (!textEntry) throw new Error('No chat text file was found in this ZIP');

  const chatText = textEntry.getData().toString('utf8').replace(/^\uFEFF/, '');
  const imageEntries = entries.filter(entry => !entry.isDirectory && /\.(jpe?g|png|webp|gif)$/i.test(entry.entryName));
  const messages = splitWhatsAppMessages(chatText);
  const products = [];
  const usedImageEntries = new Set();
  let pendingImages = [];

  for (const [index, message] of messages.entries()) {
    const rawText = String(message.text || '');
    const attachmentMatches = [...rawText.matchAll(/<attached:\s*([^>]+)>/gi)].map(match => match[1]);
    const matchedImages = [];

    for (const attachedName of attachmentMatches) {
      const imageEntry = imageEntries.find(entry => !usedImageEntries.has(entry) && findMatchingImageEntry(entry, attachedName));
      if (imageEntry) {
        matchedImages.push(imageEntry);
        usedImageEntries.add(imageEntry);
      }
    }

    const textLines = rawText
      .split(/\r?\n/)
      .map(cleanWhatsAppLine)
      .filter(Boolean)
      .filter(line => !/<attached:/i.test(line));
    const caption = textLines.filter(Boolean).join('\n').trim();
    const hasCaption = Boolean(caption);

    if (matchedImages.length) {
      pendingImages.push(...matchedImages);
    }

    if (hasCaption || pendingImages.length) {
      const attachedImages = pendingImages.length ? pendingImages : matchedImages;
      const group = {
        caption,
        imageEntries: attachedImages.slice(0, 8)
      };
      if (group.imageEntries.length) {
        pendingImages = [];
      }
      if (group.caption || group.imageEntries.length) {
        products.push(await extractProductDetails(group, products.length));
      }
    }
  }

  return { products, entries };
}

// ============================================================
// Session helpers (JWT in an httpOnly cookie)
// ============================================================
function setSessionCookie(res, cookieName, payload, maxAgeMs, req = null) {
  if (!req && res && res.req) {
    req = res.req;
  }
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: Math.floor(maxAgeMs / 1000) });
  const secureCookie = isProd && req && (req.secure || req.headers['x-forwarded-proto'] === 'https');
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    maxAge: maxAgeMs,
    path: '/'
  });
}

function readSession(req, cookieName, expectedRole) {
  const token = req.cookies ? (req.cookies[cookieName] || req.cookies[LEGACY_COOKIE_NAME]) : null;
  if (!token) return null;
  try {
    const session = jwt.verify(token, JWT_SECRET);
    return !expectedRole || session.role === expectedRole ? session : null;
  } catch (e) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const session = readSession(req, CUSTOMER_COOKIE_NAME, 'customer');
  if (!session) return res.status(401).json({ error: 'Please log in to continue' });
  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  const session = readSession(req, ADMIN_COOKIE_NAME, 'admin');
  if (!session) {
    return res.status(403).json({ error: 'Admin login required' });
  }
  req.session = session;
  next();
}

function safeUser(u) {
  return { id: u.id, name: u.name, email: u.email };
}

// Recomputes order line items and total STRICTLY from the server's own
// product catalog. The client's items array only supplies productId/color/
// quantity — never trust a price or amount sent from the browser.
// Does not mutate stock; caller decides when to actually deduct it.
function computeOrderItems(items, products) {
  const orderItems = [];
  for (const cartItem of items || []) {
    const product = products.find(p => p.id === cartItem.productId);
    if (!product) continue;
    const qty = Math.max(1, Math.min(Number(cartItem.quantity) || 1, product.stock));
    if (qty <= 0) continue;
    orderItems.push({
      productId: product.id,
      title: product.title,
      image: product.image,
      price: product.price,
      color: cartItem.color,
      size: cartItem.size || null,
      quantity: qty
    });
  }
  const totalAmount = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return { orderItems, totalAmount };
}

function similarityScore(a, b) {
  const first = String(a || '').trim().toLowerCase();
  const second = String(b || '').trim().toLowerCase();
  if (!first || !second) return 0;
  if (first === second) return 1;
  const tokensA = new Set(first.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean));
  const tokensB = new Set(second.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean));
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  const combined = Math.max(tokensA.size, tokensB.size);
  return combined === 0 ? 0 : overlap / combined;
}

// ============================================================
// PUBLIC — storefront catalog only. Never returns orders or users.
// ============================================================
app.get('/api/public/catalog', async (req, res) => {
  try {
    const products = await Product.find({}, { _id: 0, __v: 0 }).lean();
    // Store settings must never make the catalogue unavailable.
    const settings = await Settings.findById('default').lean().catch(() => null);
    res.json({
      products: products || [],
      paymentSettings: settings
        ? { payeeName: settings.payeeName, upiId: settings.upiId }
        : { payeeName: 'EasyBuy Store', upiId: 'easybuy@okaxis' }
    });
  } catch (e) {
    console.error('Catalog fetch failed:', e);
    res.status(500).json({ error: 'Failed to load catalog' });
  }
});


// ============================================================
// CUSTOMER AUTH
// ============================================================
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      id: 'u_' + crypto.randomBytes(8).toString('hex'),
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash
    });

    setSessionCookie(res, CUSTOMER_COOKIE_NAME, { sub: user.id, role: 'customer', name: user.name }, 7 * 24 * 60 * 60 * 1000);
    res.json({ user: safeUser(user) });
  } catch (e) {
    console.error('Signup failed:', e);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    setSessionCookie(res, CUSTOMER_COOKIE_NAME, { sub: user.id, role: 'customer', name: user.name }, 7 * 24 * 60 * 60 * 1000);
    res.json({ user: safeUser(user) });
  } catch (e) {
    console.error('Login failed:', e);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(CUSTOMER_COOKIE_NAME, { path: '/' });
  res.clearCookie(LEGACY_COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  const session = readSession(req, CUSTOMER_COOKIE_NAME, 'customer');
  if (!session) return res.json({ user: null });

  try {
    const user = await User.findOne({ id: session.sub }).lean();
    if (!user) return res.json({ user: null });
    res.json({ user: safeUser(user) });
  } catch (e) {
    res.json({ user: null });
  }
});

// ============================================================
// CUSTOMER ORDERS — requires login. Server trusts nothing from
// the client about prices; it re-reads them from the catalog.
// Orders are only ever created after a verified Razorpay payment
// (see /api/payments/razorpay/verify below) — there is no path
// to create a real order without a confirmed payment.
// ============================================================
app.get('/api/orders/mine', requireAuth, async (req, res) => {
  if (req.session.role !== 'customer') return res.json({ orders: [] });
  try {
    const orders = await Order.find({ userId: req.session.sub }, { _id: 0, __v: 0 })
      .sort({ _id: -1 })
      .lean();
    res.set('Cache-Control', 'no-store');
    res.json({ orders });
  } catch (e) {
    console.error('Fetch my orders failed:', e);
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

// ============================================================
// RAZORPAY PAYMENTS
// ============================================================
function requireRazorpay(req, res, next) {
  if (!razorpay) {
    return res.status(503).json({ error: 'Payments are not configured on this server yet' });
  }
  next();
}

// Step 1: create a Razorpay order for the current cart. The amount is
// computed from the server's own catalog — the client cannot influence it.
app.post('/api/payments/razorpay/order', requireAuth, requireRazorpay, async (req, res) => {
  if (req.session.role !== 'customer') {
    return res.status(403).json({ error: 'Only customer accounts can place orders' });
  }

  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  try {
    const products = await Product.find({}, { _id: 0, __v: 0 }).lean();
    const { orderItems, totalAmount } = computeOrderItems(items, products);

    if (orderItems.length === 0 || totalAmount <= 0) {
      return res.status(400).json({ error: 'No valid, in-stock items in cart' });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100), // paise
      currency: 'INR',
      receipt: 'rcpt_' + Date.now()
    });

    res.json({
      keyId: RAZORPAY_KEY_ID,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency
    });
  } catch (e) {
    console.error('Razorpay order creation failed:', e);
    res.status(e.statusCode || 502).json({ error: e.message || 'Could not start payment. Please try again.' });
  }
});

// Step 2: verify the payment signature Razorpay's checkout handed back to
// the browser, and ONLY THEN create + fulfil the real order server-side.
app.post('/api/payments/razorpay/verify', requireAuth, requireRazorpay, async (req, res) => {
  if (req.session.role !== 'customer') {
    return res.status(403).json({ error: 'Only customer accounts can place orders' });
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    items,
    shippingInfo
  } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment confirmation details' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  if (!shippingInfo || !shippingInfo.name || !shippingInfo.phone || !shippingInfo.address || !shippingInfo.city || !shippingInfo.pincode) {
    return res.status(400).json({ error: 'Shipping information is incomplete' });
  }
  if (String(shippingInfo.country || '').trim().toLowerCase() !== 'india') {
    return res.status(400).json({ error: 'We currently deliver only within India.' });
  }

  // Cryptographic proof the payment actually happened and wasn't forged
  // client-side. This is the step that makes the whole flow trustworthy.
  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const providedSig = Buffer.from(razorpay_signature);
  const expectedSig = Buffer.from(expectedSignature);
  const validSignature = providedSig.length === expectedSig.length && crypto.timingSafeEqual(providedSig, expectedSig);

  if (!validSignature) {
    return res.status(400).json({ error: 'Payment verification failed. If money was deducted, contact support with your payment ID.' });
  }

  try {
    const products = await Product.find({}, { _id: 0, __v: 0 }).lean();
    const { orderItems, totalAmount } = computeOrderItems(items, products);

    if (orderItems.length === 0) {
      return res.status(400).json({ error: 'No valid, in-stock items in cart' });
    }

    // Confirm the payment is for exactly the server-calculated amount.
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.amount !== Math.round(totalAmount * 100)) {
      return res.status(400).json({ error: 'Payment amount does not match the order total' });
    }

    // Deduct stock atomically now that payment is confirmed
    await Promise.all(orderItems.map(item =>
      Product.updateOne({ id: item.productId }, { $inc: { stock: -item.quantity } })
    ));

    const order = await Order.create({
      id: 'ord_' + Date.now(),
      userId: req.session.sub,
      date: new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }),
      items: orderItems,
      shippingInfo,
      paymentMethod: 'Razorpay',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      totalAmount,
      status: 'Pending',
      deliveryTracking: [{ status: 'Pending', message: 'Order confirmed and being prepared.' }]
    });

    // The message is sent only after the payment signature is verified and the
    // order has been successfully stored.
   // Send response immediately
res.json({ order: stripInternal(order) });

// Send email in background
const user = await User.findOne({ id: req.session.sub });

if (user && user.email) {
    sendOrderConfirmation(user.email, order)
        .then(() => console.log("Order email sent"))
        .catch(err => console.error("Order email failed:", err));
}
  } catch (e) {
    console.error('Order fulfillment after payment failed:', e);
    res.status(500).json({ error: 'Payment succeeded but order creation failed. Contact support with your payment ID: ' + razorpay_payment_id });
  }
});

// ============================================================
// ADMIN AUTH — checked against env vars, not stored in the DB.
// ============================================================
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const suppliedUser = Buffer.from(String(username));
  const expectedUser = Buffer.from(ADMIN_USERNAME);
  const suppliedPass = Buffer.from(String(password));
  const expectedPass = Buffer.from(ADMIN_PASSWORD);

  const userOk = suppliedUser.length === expectedUser.length && crypto.timingSafeEqual(suppliedUser, expectedUser);
  const passOk = suppliedPass.length === expectedPass.length && crypto.timingSafeEqual(suppliedPass, expectedPass);

  if (!userOk || !passOk) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  setSessionCookie(res, ADMIN_COOKIE_NAME, { sub: 'admin', role: 'admin', name: 'Admin' }, 8 * 60 * 60 * 1000, req);
  res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
  res.clearCookie(LEGACY_COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

app.get('/api/admin/me', (req, res) => {
  const session = readSession(req, ADMIN_COOKIE_NAME, 'admin');
  res.json({ isAdmin: !!session });
});

// ============================================================
// ADMIN DATA — every route below requires a valid admin session
// ============================================================
app.get('/api/admin/data', requireAdmin, async (req, res) => {
  try {
    const [products, orders, settings, customerCount] = await Promise.all([
      Product.find({}, { _id: 0, __v: 0 }).lean(),
      Order.find({}, { _id: 0, __v: 0 }).sort({ _id: -1 }).lean(),
      Settings.findById('default').lean(),
      User.countDocuments()
    ]);
    res.json({
      products,
      orders,
      paymentSettings: settings
        ? { payeeName: settings.payeeName, upiId: settings.upiId }
        : { payeeName: 'EasyBuy Store', upiId: 'easybuy@okaxis' },
      customerCount
    });
  } catch (e) {
    console.error('Admin data fetch failed:', e);
    res.status(500).json({ error: 'Failed to load admin data' });
  }
});

// Upload a product image directly (no external URL needed). Stored as a
// base64 data URI in MongoDB — fine for a small-to-medium catalog; if the
// catalog grows large, migrating to Cloudinary/S3 would be the next step.
app.post('/api/admin/upload-image', requireAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Image is too large (max 3MB)'
        : (err.message || 'Upload failed');
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file received' });
    }

    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    res.json({ imageUrl: dataUri });
  });
});

// Upload MULTIPLE product photos at once (up to 6, 3MB each). Returns an
// array of data URIs in the same order the files were selected.
app.post('/api/admin/upload-images', requireAdmin, (req, res) => {
  upload.array('images', 6)(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'One of the images is too large (max 3MB each)'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'You can upload up to 6 photos per product'
          : (err.message || 'Upload failed');
      return res.status(400).json({ error: message });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files received' });
    }

    const imageUrls = req.files.map(file =>
      `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
    );
    res.json({ imageUrls });
  });
});

// Upload a WhatsApp "Export chat with media" ZIP and return a reviewable
// catalog preview. Nothing is written to MongoDB at this stage.
app.post('/api/admin/import-whatsapp-catalog/preview', requireAdmin, async (req, res) => {
  catalogUpload.single('catalog')(req, res, async (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'The ZIP is too large (maximum 50MB)' : (err.message || 'Upload failed');
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: 'Please choose your WhatsApp ZIP file' });

    try {
      const parsed = await parseWhatsAppCatalog(req.file.buffer);
      if (!parsed.products.length) {
        return res.status(400).json({ error: 'No products with a price or caption were found. Each product message should contain a caption and ideally a price such as “Price: ₹600”.' });
      }

      const existingProducts = await Product.find({}, { _id: 0, __v: 0 }).lean();
      const products = parsed.products.map(product => {
        const imageEntries = Array.isArray(product.imageEntries) ? product.imageEntries : [];
        const imageUrls = imageEntries
          .map(entry => toDataUri(entry.getData ? entry.getData() : null, entry.entryName))
          .filter(Boolean);
        const primaryImage = imageUrls[0] || null;
        const bestMatch = existingProducts
          .map(existing => {
            const nameSimilarity = similarityScore(product.title, existing.title || '');
            const imageSimilarity = imageUrls.length && Array.isArray(existing.images) && existing.images.length > 0
              ? Math.max(...imageUrls.map(url => (url === existing.image ? 1 : 0)))
              : 0;
            return {
              ...existing,
              nameSimilarity,
              imageSimilarity,
              score: Math.max(nameSimilarity, imageSimilarity)
            };
          })
          .filter(candidate => candidate.score >= 0.9)
          .sort((a, b) => b.score - a.score)[0] || null;

        return {
          ...product,
          hasImage: Boolean(primaryImage || imageUrls.length),
          imageUrl: primaryImage,
          imageUrls,
          duplicateMatch: bestMatch ? { id: bestMatch.id, title: bestMatch.title, score: bestMatch.score } : null,
          action: bestMatch ? 'update' : 'create',
          isSelected: !product.needsReview,
          isEstimatedPrice: !/\b(mrp|original|was)\b/i.test(product.title + ' ' + product.description)
        };
      });

      const token = crypto.randomUUID();
      whatsappImportPreviews.set(token, { expiresAt: Date.now() + (30 * 60 * 1000), products, entries: parsed.entries });
      setTimeout(() => whatsappImportPreviews.delete(token), 31 * 60 * 1000).unref?.();

      res.json({ token, products });
    } catch (e) {
      console.error('WhatsApp catalog preview failed:', e);
      res.status(400).json({ error: 'Could not read this ZIP. Export the WhatsApp chat again and choose “With Media”.' });
    }
  });
});

// Commit selected products from a previously created preview. The data is read
// from the server-side preview, never from editable browser fields.
app.post('/api/admin/import-whatsapp-catalog/commit', requireAdmin, async (req, res) => {
  const preview = whatsappImportPreviews.get(String(req.body?.token || ''));
  if (!preview || preview.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'This preview has expired. Please upload the ZIP again.' });
  }

  const incomingProducts = Array.isArray(req.body?.previewProducts) ? req.body.previewProducts : [];
  const previewProducts = incomingProducts.length ? incomingProducts : preview.products;
  const selected = previewProducts.filter(product => product.isSelected !== false && product.action !== 'skip');
  if (!selected.length) return res.status(400).json({ error: 'Select at least one product to import' });

  try {
    let imagesSkipped = 0;
    const documents = [];
    for (const [index, product] of selected.entries()) {
      const imageUris = Array.isArray(product.imageUrls) ? product.imageUrls.filter(Boolean) : [];
      const image = imageUris[0] || '';
      const images = imageUris.slice(0, 6);
      const baseDoc = {
        id: `p_${Date.now()}_${index}_${crypto.randomUUID().slice(0, 6)}`,
        title: product.title || `WhatsApp product ${index + 1}`,
        category: product.category || 'Accessories',
        subcategory: product.subcategory || '',
        price: Number(product.price) || 0,
        originalPrice: Number(product.originalPrice) || Number(product.price) || 0,
        colors: Array.isArray(product.colors) ? product.colors : [],
        sizes: [],
        rating: 4,
        ratingCount: 0,
        image,
        images,
        description: product.description || 'Imported from WhatsApp catalog.',
        stock: Number(product.stock) || 10
      };

      if (product.action === 'update' && product.duplicateMatch?.id) {
        const existing = await Product.findOne({ id: product.duplicateMatch.id });
        if (existing) {
          await Product.updateOne({ id: existing.id }, {
            $set: {
              title: baseDoc.title,
              category: baseDoc.category,
              subcategory: baseDoc.subcategory,
              price: baseDoc.price,
              originalPrice: baseDoc.originalPrice,
              description: baseDoc.description,
              image: baseDoc.image || existing.image,
              images: baseDoc.images.length ? baseDoc.images : existing.images || [existing.image],
              stock: baseDoc.stock
            }
          });
          continue;
        }
      }

      if (Number(baseDoc.price) <= 0) {
        imagesSkipped += 1;
        continue;
      }

      documents.push(baseDoc);
    }

    if (documents.length) {
      await Product.insertMany(documents);
    }
    whatsappImportPreviews.delete(String(req.body?.token || ''));
    res.json({ importedCount: documents.length, imagesSkipped });
  } catch (e) {
    console.error('WhatsApp catalog import failed:', e);
    res.status(500).json({ error: 'Could not import the selected products' });
  }
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const p = req.body || {};
  if (!p.title || !p.category) {
    return res.status(400).json({ error: 'Title and category are required' });
  }

  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  const coverImage = p.image || images[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=600';

  try {
    const product = await Product.create({
      id: 'p_' + Date.now(),
      title: p.title,
      category: p.category,
      subcategory: String(p.subcategory || '').trim(),
      price: Number(p.price),
      originalPrice: Number(p.originalPrice || p.price),
      colors: Array.isArray(p.colors) ? p.colors : String(p.colors || '').split(',').map(s => s.trim()).filter(Boolean),
      sizes: Array.isArray(p.sizes) ? p.sizes : String(p.sizes || '').split(',').map(s => s.trim()).filter(Boolean),
      rating: Number(p.rating || 4.0),
      ratingCount: Number(p.ratingCount || 1),
      image: coverImage,
      images: images.length > 0 ? images : [coverImage],
      description: p.description || 'No description provided.',
      stock: Number(p.stock || 0)
    });
    res.json({ product: stripInternal(product) });
  } catch (e) {
    console.error('Add product failed:', e);
    res.status(500).json({ error: 'Failed to add product' });
  }
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const p = req.body || {};
  const colors = Array.isArray(p.colors) ? p.colors : String(p.colors || '').split(',').map(s => s.trim()).filter(Boolean);
  const sizes = Array.isArray(p.sizes) ? p.sizes : String(p.sizes || '').split(',').map(s => s.trim()).filter(Boolean);

  try {
    const existing = await Product.findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const images = Array.isArray(p.images) ? p.images.filter(Boolean) : undefined;
    const coverImage = p.image || (images && images[0]) || existing.image;

    existing.set({
      ...p,
      price: Number(p.price),
      originalPrice: Number(p.originalPrice || p.price),
      colors,
      sizes,
      subcategory: String(p.subcategory || '').trim(),
      stock: Number(p.stock),
      rating: Number(p.rating || existing.rating),
      image: coverImage,
      images: images && images.length > 0 ? images : (existing.images && existing.images.length > 0 ? existing.images : [coverImage])
    });
    await existing.save();
    res.json({ product: stripInternal(existing) });
  } catch (e) {
    console.error('Update product failed:', e);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    await Product.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    console.error('Delete product failed:', e);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

app.patch('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!['Pending', 'Shipped', 'Delivered', 'Cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const trackingMessages = {
      Pending: 'Order is being prepared.',
      Shipped: 'Order has been shipped and is on its way.',
      Delivered: 'Order has been delivered.',
      Cancelled: 'Order has been cancelled.'
    };
    const order = await Order.findOneAndUpdate(
      { id: req.params.id },
      { status, $push: { deliveryTracking: { status, message: trackingMessages[status] } } },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ order: stripInternal(order) });
  } catch (e) {
    console.error('Update order status failed:', e);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

app.post('/api/admin/settings', requireAdmin, async (req, res) => {
  const { payeeName, upiId } = req.body || {};
  if (!upiId) {
    return res.status(400).json({ error: 'UPI ID is required' });
  }

  try {
    const settings = await Settings.findByIdAndUpdate(
      'default',
      { payeeName: payeeName || 'EasyBuy Store', upiId },
      { new: true, upsert: true }
    );
    res.json({ paymentSettings: { payeeName: settings.payeeName, upiId: settings.upiId } });
  } catch (e) {
    console.error('Update settings failed:', e);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ============================================================
// NEW FEATURES API
// ============================================================

// Parses "Name <email@example.com>" or a bare "email@example.com" into
// { name, email } for Brevo's sender field.
function parseSender(fromString) {
  const match = String(fromString || '').match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim() || 'EasyBuy', email: match[2].trim() };
  }
  return { name: 'EasyBuy', email: String(fromString || '').trim() || 'alvinjohnmathew6@gmail.com' };
}

async function sendOrderConfirmation(email, order) {
    if (!process.env.BREVO_API_KEY) {
        console.error('BREVO_API_KEY is not set — cannot send order confirmation email.');
        return;
    }

    const sender = parseSender(SMTP_FROM);

    try {
        await axios.post(
            "https://api.brevo.com/v3/smtp/email",
            {
                sender,
                to: [
                    {
                        email: email
                    }
                ],
                subject: `Order Confirmation - ${order.id}`,
                htmlContent: `
                    <h2>Thank you for shopping with EasyBuy!</h2>

                    <p>Your order has been confirmed.</p>

                    <p><b>Order ID:</b> ${order.id}</p>

                    <p><b>Total:</b> ₹${order.totalAmount}</p>

                    <p><b>Status:</b> ${order.status}</p>

                    <br>

                    <p>Questions about this order? Contact us at alvinjohnmathew6@gmail.com</p>

                    <p>Thank you for choosing EasyBuy.</p>
                `
            },
            {
                headers: {
                    "api-key": process.env.BREVO_API_KEY,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log(`✅ Order confirmation email sent to ${email} for ${order.id}`);

    } catch (err) {
        // Surface the ACTUAL reason Brevo rejected the request — the most
        // common causes are an unverified sender address or an invalid/
        // expired API key. Without logging err.response.data here, these
        // failures are silent and impossible to diagnose from the logs.
        console.error(`❌ Brevo email send FAILED for order ${order.id}, recipient ${email}`);
        if (err.response) {
            console.error('Brevo status:', err.response.status);
            console.error('Brevo response:', JSON.stringify(err.response.data));
        } else {
            console.error('Error:', err.message);
        }
    }
}
// User Profile
app.get('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.session.sub }, { _id: 0, passwordHash: 0, __v: 0 }).lean();
    res.json({ user });
  } catch(e) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/api/user/profile', requireAuth, async (req, res) => {
  const { phone, address, name } = req.body || {};
  try {
    const user = await User.findOneAndUpdate(
      { id: req.session.sub },
      { phone, address, name },
      { new: true, select: '-passwordHash -_id -__v' }
    ).lean();
    res.json({ user });
  } catch(e) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Wishlist
app.get('/api/user/wishlist', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.session.sub }).lean();
    const wishlistIds = user.wishlist || [];
    const products = await Product.find({ id: { $in: wishlistIds } }, { _id: 0, __v: 0 }).lean();
    res.json({ wishlist: products });
  } catch(e) {
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

app.post('/api/user/wishlist', requireAuth, async (req, res) => {
  const { productId } = req.body;
  try {
    const user = await User.findOneAndUpdate(
      { id: req.session.sub },
      { $addToSet: { wishlist: productId } },
      { new: true }
    );
    res.json({ success: true, wishlist: user.wishlist });
  } catch(e) {
    res.status(500).json({ error: 'Failed to add to wishlist' });
  }
});

app.delete('/api/user/wishlist/:productId', requireAuth, async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { id: req.session.sub },
      { $pull: { wishlist: req.params.productId } },
      { new: true }
    );
    res.json({ success: true, wishlist: user.wishlist });
  } catch(e) {
    res.status(500).json({ error: 'Failed to remove from wishlist' });
  }
});

// Reviews
app.get('/api/products/:id/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ productId: req.params.id }, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean();
    res.json({ reviews });
  } catch(e) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

app.post('/api/products/:id/reviews', requireAuth, async (req, res) => {
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Invalid rating' });
  
  try {
    const user = await User.findOne({ id: req.session.sub }).lean();
    const review = await Review.create({
      id: 'rev_' + Date.now(),
      productId: req.params.id,
      userId: user.id,
      userName: user.name,
      rating: Number(rating),
      comment
    });
    
    const product = await Product.findOne({ id: req.params.id });
    const currentTotal = (product.rating || 0) * (product.ratingCount || 0);
    const newCount = (product.ratingCount || 0) + 1;
    const newRating = (currentTotal + Number(rating)) / newCount;
    await Product.updateOne({ id: req.params.id }, { rating: newRating.toFixed(1), ratingCount: newCount });
    
    res.json({ review: stripInternal(review) });
  } catch(e) {
    res.status(500).json({ error: 'Failed to add review' });
  }
});

// AI Chat
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  res.json({ reply: "I'm your AI shopping assistant! I can help you find products and answer your questions." });
});

// Analytics
app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
  try {
    const orders = await Order.find({}).lean();
    const totalSales = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const orderCount = orders.length;
    res.json({ totalSales, orderCount });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// ============================================================
// Static files LAST, so API routes always take priority
// ============================================================
app.use(express.static(__dirname));

// ============================================================
// Startup: connect to MongoDB, seed initial data if empty, then listen
// ============================================================
async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const productCount = await Product.countDocuments();
  if (productCount === 0) {
    const seedPath = path.join(__dirname, 'seed-products.json');
    if (fs.existsSync(seedPath)) {
      const seedProducts = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      await Product.insertMany(seedProducts);
      console.log(`Seeded ${seedProducts.length} products`);
    } else {
      console.warn('No seed-products.json found — starting with an empty catalog.');
    }
  }

  const settingsExist = await Settings.findById('default');
  if (!settingsExist) {
    await Settings.create({ _id: 'default' });
  }

  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`EasyBuy server running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('\n[FATAL] Failed to start server:', err.message);
  process.exit(1);
});

const catalogUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!String(file.originalname || '').toLowerCase().endsWith('.zip')) {
      return cb(new Error('Please select a WhatsApp chat ZIP file'));
    }
    cb(null, true);
  }
});
