const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['task_earning', 'referral_bonus', 'withdrawal', 'withdrawal_fee', 'adjustment'],
    required: true
  },
  amountETB: {
    type: Number,
    required: true
  },
  balanceAfterETB: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  reference: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  referenceModel: {
    type: String,
    enum: ['Task', 'User', 'Withdrawal', 'Deposit', null],
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'completed'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Transaction', transactionSchema);
