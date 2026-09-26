const mongoose = require('mongoose');

const WhatsAppProductDraftSchema = new mongoose.Schema({
  source: { type: String, default: 'whatsapp' },
  sourceMessageId: { type: String },

  title: { type: String },
  brand: { type: String },
  category: { type: String },
  subcategory: { type: String },

  description: { type: String },
  features: [{ type: String }],

  offer: { type: String },
  shipping: { type: String },

  whatsappPrice: { type: Number }, // price from WhatsApp caption/image
  price: { type: Number }, // final EasyBuy price (whatsappPrice + 200)
  originalPrice: { type: Number }, // MRP if available

  colors: [{ type: String }],
  sizes: [{ type: String }],

  image: { type: String }, // first image filename/path
  images: [{ type: String }], // all image filenames/paths

  confidence: { type: Number },

  priceSource: { type: String, enum: ['caption', 'image', 'both', 'unknown'] },
  priceConflict: { type: Boolean, default: false },

  duplicate: { type: Boolean, default: false },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'pending_ai_retry'], default: 'pending' },

  createdAt: { type: Date, default: Date.now }
});

// Indexes for quick lookup
WhatsAppProductDraftSchema.index({ title: 1 });
WhatsAppProductDraftSchema.index({ category: 1 });
WhatsAppProductDraftSchema.index({ sourceMessageId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('WhatsAppProductDraft', WhatsAppProductDraftSchema);
