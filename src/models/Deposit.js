const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amountETB: {
    type: Number,
    required: true,
    min: 1
  },
  method: {
    type: String,
    enum: ['telebirr', 'mpesa', 'cbe', 'cbe_birr'],
    required: true
  },
  // Payment reference number provided by user (e.g. Telebirr transaction ID)
  paymentReference: {
    type: String,
    trim: true
  },
  // Uploaded receipt file path
  receiptPath: {
    type: String,
    default: null
  },
  receiptOriginalName: {
    type: String,
    default: null
  },
  // Sender details
  senderName: {
    type: String,
    trim: true
  },
  senderPhone: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  adminNote: {
    type: String,
    default: ''
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  // When credited to wallet
  creditedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Deposit', depositSchema);
