const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, maxlength: 2000 },
  category:    { type: String, required: true, enum: ['Video Rating','Writing','Data Entry','Survey','Delivery','Translation','Social Engagement','Content Creation','Lead Generation','Other'] },
  requirements: [{ type: String, trim: true }],
  earningETB:   { type: Number, required: true, min: 1 },
  workDepositETB: { type: Number, default: 0 },   // refundable deposit required
  estimatedMinutes: { type: Number, default: 15 },
  totalSlots:  { type: Number, default: 100 },
  filledSlots: { type: Number, default: 0 },
  isActive:    { type: Boolean, default: true },
  expiresAt:   { type: Date, default: () => new Date(Date.now() + 7 * 864e5) },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tags:        [String],

  // Minimum level required to accept this task
  minLevel: { type: String, enum: ['intern','job1','job2','job3','job4','job5','job6','job7','job8','job9','job10'], default: 'intern' },

  // Multimedia guidance
  trailerVideoUrl: { type: String, default: null },   // YouTube / TikTok / Instagram embed URL
  trailerPlatform: { type: String, enum: ['youtube','tiktok','instagram','other', null], default: null },

  // Quality
  minQualityScore: { type: Number, default: 0 }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

taskSchema.virtual('spotsLeft').get(function () { return this.totalSlots - this.filledSlots; });
taskSchema.virtual('isExpired').get(function () { return new Date() > this.expiresAt; });

module.exports = mongoose.model('Task', taskSchema);
