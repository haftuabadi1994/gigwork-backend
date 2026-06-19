const User        = require('../models/User');
const Transaction = require('../models/Transaction');
const Withdrawal  = require('../models/Withdrawal');
const { debitWallet } = require('../utils/wallet');

const ETB_RATE = () => Number(process.env.ETB_TO_USD_RATE) || 56.5;

// GET /api/wallet
exports.getWallet = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const rate = ETB_RATE();
    res.json({
      incomeWalletETB:     user.incomeWalletETB,
      incomeWalletUSD:     +(user.incomeWalletETB / rate).toFixed(2),
      personalWalletETB:   user.personalWalletETB,
      personalWalletUSD:   +(user.personalWalletETB / rate).toFixed(2),
      workDepositETB:      user.workDepositETB,
      // Backward compat
      balanceETB:          user.incomeWalletETB,
      balanceUSD:          +(user.incomeWalletETB / rate).toFixed(2),
      totalEarnedETB:      user.totalEarnedETB,
      totalEarnedUSD:      +(user.totalEarnedETB / rate).toFixed(2),
      totalReferralBonusETB: user.totalReferralBonusETB,
      totalTeamBonusETB:   user.totalTeamBonusETB,
      tasksCompleted:      user.tasksCompleted,
      qualityScore:        user.qualityScore,
      exchangeRate:        rate
    });
  } catch (err) { next(err); }
};

// GET /api/wallet/transactions
exports.getTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const query = { user: req.user._id };
    if (type) query.type = type;
    const txs   = await Transaction.find(query).sort({ createdAt:-1 }).skip((page-1)*limit).limit(Number(limit));
    const total = await Transaction.countDocuments(query);
    res.json({ transactions: txs, total, page: Number(page) });
  } catch (err) { next(err); }
};

// POST /api/wallet/withdraw
exports.requestWithdrawal = async (req, res, next) => {
  try {
    const { amountETB, method, accountNumber, accountName } = req.body;
    const min = Number(process.env.MIN_WITHDRAWAL) || 200;
    if (amountETB < min) return res.status(400).json({ error: `Minimum withdrawal is ${min} ETB.` });

    const user = await User.findById(req.user._id);
    if (user.incomeWalletETB < amountETB) return res.status(400).json({ error: 'Insufficient income wallet balance.' });

    const withdrawal = await Withdrawal.create({ user: req.user._id, amountETB, method, accountNumber, accountName });
    await debitWallet({ userId: req.user._id, amountETB, type: 'withdrawal', description: `Withdrawal via ${method}`, reference: withdrawal._id, referenceModel: 'Withdrawal' });

    res.status(201).json({ message: 'Withdrawal request submitted. Processing within 24 hours.', withdrawal });
  } catch (err) { next(err); }
};

// GET /api/wallet/withdrawals
exports.getWithdrawals = async (req, res, next) => {
  try {
    const withdrawals = await Withdrawal.find({ user: req.user._id }).sort({ createdAt:-1 });
    res.json({ withdrawals });
  } catch (err) { next(err); }
};
