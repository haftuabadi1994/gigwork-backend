const mongoose = require('mongoose');

const equbTransactionSchema = new mongoose.Schema({
  equb:  { type: mongoose.Schema.Types.ObjectId, ref: 'Equb',      required: true, index: true },
  round: { type: mongoose.Schema.Types.ObjectId, ref: 'EqubRound', default: null },
  user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',      required: true, index: true },

  type:      { type: String, enum: ['contribution', 'payout', 'penalty', 'refund'], required: true },
  amountETB: { type: Number, required: true },
  status:    { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
  note:      { type: String, default: '' },
}, { timestamps: true });

equbTransactionSchema.index({ user: 1, createdAt: -1 });
equbTransactionSchema.index({ equb: 1, type: 1 });

module.exports = mongoose.model('EqubTransaction', equbTransactionSchema);
