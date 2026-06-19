const User        = require('../models/User');
const Transaction = require('../models/Transaction');

/**
 * Credit the income wallet.
 * Uses findOneAndUpdate with $inc for atomicity without needing a replica set.
 */
exports.creditWallet = async ({ userId, amountETB, type, description, reference, referenceModel }) => {
  // Atomically increment wallet balance
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { incomeWalletETB: amountETB, totalEarnedETB: amountETB } },
    { new: true, runValidators: false }
  );
  if (!user) throw new Error('User not found');

  // Log the transaction
  const tx = await Transaction.create({
    user: userId,
    type,
    amountETB,
    balanceAfterETB: user.incomeWalletETB,
    description,
    reference:      reference || undefined,
    referenceModel: referenceModel || undefined,
    status: 'completed'
  });

  return tx;
};

/**
 * Debit the income wallet (withdrawals).
 * Uses findOneAndUpdate with $inc — checks balance first.
 */
exports.debitWallet = async ({ userId, amountETB, type, description, reference, referenceModel }) => {
  // Check balance first
  const check = await User.findById(userId).select('incomeWalletETB');
  if (!check) throw new Error('User not found');
  if (check.incomeWalletETB < amountETB) throw new Error('Insufficient income wallet balance');

  // Atomically decrement
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { incomeWalletETB: -amountETB } },
    { new: true, runValidators: false }
  );

  const tx = await Transaction.create({
    user: userId,
    type,
    amountETB: -amountETB,
    balanceAfterETB: user.incomeWalletETB,
    description,
    reference:      reference || undefined,
    referenceModel: referenceModel || undefined,
    status: 'completed'
  });

  return tx;
};

/**
 * Credit the personal wallet (deposits/recharges).
 */
exports.creditPersonalWallet = async ({ userId, amountETB, description }) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { personalWalletETB: amountETB } },
    { new: true, runValidators: false }
  );
  if (!user) throw new Error('User not found');
  return user.personalWalletETB;
};
