const { notify } = require('./notificationController');
const Deposit = require('../models/Deposit');
const User = require('../models/User');
const { creditWallet } = require('../utils/wallet');
const path = require('path');

// Payment method display info
const PAYMENT_METHODS = {
  telebirr: {
    name: 'Telebirr',
    accountNumber: '0912345678',
    accountName: 'GigWork Ethiopia',
    instructions: 'Open Telebirr → Send Money → Enter the number above → Use your full name as reference.',
    color: '#E91E8C'
  },
  mpesa: {
    name: 'M-Pesa',
    accountNumber: '0911223344',
    accountName: 'GigWork ET',
    instructions: 'Open M-Pesa → Lipa na M-Pesa → Enter the number above → Enter the exact amount.',
    color: '#4CAF50'
  },
  cbe: {
    name: 'CBE (Commercial Bank of Ethiopia)',
    accountNumber: '1000123456789',
    accountName: 'GigWork Technology PLC',
    instructions: 'Log in to CBE Birr or visit any CBE branch → Transfer to the account number above → Keep your transaction receipt.',
    color: '#1976D2'
  },
  cbe_birr: {
    name: 'CBE Birr',
    accountNumber: '0922334455',
    accountName: 'GigWork Technology',
    instructions: 'Open CBE Birr app → Send Money → Enter the number above → Screenshot your confirmation.',
    color: '#0D47A1'
  }
};

// GET /api/deposits/methods — return payment method details
exports.getMethods = (req, res) => {
  res.json({ methods: PAYMENT_METHODS });
};

// POST /api/deposits — submit a new deposit request
exports.submitDeposit = async (req, res, next) => {
  try {
    const { amountETB, method, paymentReference, senderName, senderPhone } = req.body;

    if (!amountETB || amountETB < 1) {
      return res.status(400).json({ error: 'Invalid deposit amount.' });
    }
    if (!PAYMENT_METHODS[method]) {
      return res.status(400).json({ error: 'Invalid payment method.' });
    }
    if (!paymentReference && !req.file) {
      return res.status(400).json({ error: 'Please provide either a payment reference number or upload a receipt.' });
    }

    const deposit = await Deposit.create({
      user: req.user._id,
      amountETB: Number(amountETB),
      method,
      paymentReference: paymentReference || null,
      receiptPath: req.file ? req.file.filename : null,
      receiptOriginalName: req.file ? req.file.originalname : null,
      senderName: senderName || req.user.name,
      senderPhone: senderPhone || req.user.phone || ''
    });

    res.status(201).json({
      message: 'Deposit request submitted! Our team will verify and credit your wallet within 1–2 hours.',
      deposit
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/deposits — user's deposit history
exports.getMyDeposits = async (req, res, next) => {
  try {
    const deposits = await Deposit.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ deposits });
  } catch (err) {
    next(err);
  }
};

// ── ADMIN ──────────────────────────────────────────────────────────────────────

// GET /api/admin/deposits
exports.adminListDeposits = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20, method } = req.query;
    const query = {};
    if (status) query.status = status;
    if (method) query.method = method;

    const deposits = await Deposit.find(query)
      .populate('user', 'name email phone balanceETB')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Deposit.countDocuments(query);

    // Pending amount totals
    const pending = await Deposit.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amountETB' }, count: { $sum: 1 } } }
    ]);

    res.json({
      deposits,
      total,
      pendingTotal: pending[0]?.total || 0,
      pendingCount: pending[0]?.count || 0
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/deposits/:id — approve or reject
exports.adminReviewDeposit = async (req, res, next) => {
  try {
    const { action, adminNote } = req.body; // action: 'approve' | 'reject'

    const deposit = await Deposit.findById(req.params.id).populate('user');
    if (!deposit) return res.status(404).json({ error: 'Deposit not found.' });
    if (deposit.status === 'approved') return res.status(400).json({ error: 'Already approved.' });

    deposit.reviewedBy = req.user._id;
    deposit.reviewedAt = new Date();
    deposit.adminNote = adminNote || '';

    if (action === 'approve') {
      deposit.status = 'approved';
      deposit.creditedAt = new Date();
      await deposit.save();

      // Credit user wallet
      await creditWallet({
        userId: deposit.user._id,
        amountETB: deposit.amountETB,
        type: 'adjustment',
        description: `Deposit approved — ${deposit.method.replace('_', ' ').toUpperCase()} (Ref: ${deposit.paymentReference || 'receipt'})`,
        reference: deposit._id,
        referenceModel: 'Deposit'
      });

      // Notify user
      await notify(deposit.user._id, 'deposit_approved', 'Deposit approved! 💰',
        `Your ${deposit.method.toUpperCase()} deposit of ${deposit.amountETB} ETB has been verified and credited to your wallet.`, { amount: deposit.amountETB });

      res.json({ message: `✅ Deposit of ${deposit.amountETB} ETB approved and credited to ${deposit.user.name}.` });
    } else if (action === 'reject') {
      deposit.status = 'rejected';
      await deposit.save();
      await notify(deposit.user._id, 'deposit_rejected', 'Deposit not approved',
        `Your deposit of ${deposit.amountETB} ETB could not be verified. Reason: ${adminNote || 'Please contact support.'}`, { amount: deposit.amountETB });

      res.json({ message: `Deposit rejected. User notified.` });
    } else {
      res.status(400).json({ error: 'Invalid action. Use approve or reject.' });
    }
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/deposits/:id/receipt — serve receipt file
exports.serveReceipt = async (req, res, next) => {
  try {
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit || !deposit.receiptPath) {
      return res.status(404).json({ error: 'No receipt found.' });
    }
    const filePath = path.join(__dirname, '../../uploads/receipts', deposit.receiptPath);
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
};
