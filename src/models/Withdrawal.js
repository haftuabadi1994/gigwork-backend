const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amountETB: {
    type: Number,
    required: true,
    min: 200
  },
  method: {
    type: String,
    enum: ['telebirr', 'cbe_birr', 'bank_transfer', 'other'],
    required: true
  },
  accountNumber: {
    type: String,
    required: true
  },
  accountName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'rejected'],
    default: 'pending'
  },
  adminNote: String,
  processedAt: Date
}, {
  timestamps: true
});

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
