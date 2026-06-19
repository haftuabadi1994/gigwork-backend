const mongoose = require('mongoose');

const handbookSchema = new mongoose.Schema({
  slug:    { type: String, unique: true, required: true },
  title:   { type: String, required: true },
  content: { type: String, default: '' },   // markdown/HTML content
  order:   { type: Number, default: 0 },
  isPublished: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Handbook', handbookSchema);
