const router       = require('express').Router();
const ctrl         = require('../controllers/adminController');
const depositCtrl  = require('../controllers/depositController');
const hbCtrl       = require('../controllers/handbookController');
const teamCtrl     = require('../controllers/teamController');
const { protect, adminOnly } = require('../middleware/auth');
const Transaction  = require('../models/Transaction');
const Notification = require('../models/Notification');
const User         = require('../models/User');

// All admin routes require auth + admin role
router.use(protect, adminOnly);

// ── Dashboard & Analytics ─────────────────────────────────────────────────────
router.get('/dashboard',  ctrl.getDashboard);
router.get('/analytics',  ctrl.getAnalytics);

// ── Users ─────────────────────────────────────────────────────────────────────
router.get('/users',                   ctrl.listUsers);
router.get('/users/:id',               ctrl.getUser);
router.patch('/users/:id',             ctrl.updateUser);
router.post('/users/:id/adjust-wallet',ctrl.adjustWallet);
router.delete('/users/:id',            ctrl.deleteUser);

// ── Tasks ─────────────────────────────────────────────────────────────────────
router.get('/tasks',                             ctrl.adminListTasks);
router.post('/tasks',                            ctrl.createTask);
router.patch('/tasks/:id',                       ctrl.updateTask);
router.delete('/tasks/:id',                      ctrl.deleteTask);
router.get('/tasks/:id/submissions',             ctrl.getTaskSubmissions);
router.patch('/submissions/:assignmentId/review',ctrl.reviewSubmission);

// ── Withdrawals ───────────────────────────────────────────────────────────────
router.get('/withdrawals',      ctrl.listWithdrawals);
router.patch('/withdrawals/:id',ctrl.processWithdrawal);

// ── Deposits ──────────────────────────────────────────────────────────────────
router.get('/deposits',              depositCtrl.adminListDeposits);
router.patch('/deposits/:id',        depositCtrl.adminReviewDeposit);
router.get('/deposits/:id/receipt',  depositCtrl.serveReceipt);

// ── Transactions (full ledger) ────────────────────────────────────────────────
router.get('/transactions', async (req, res, next) => {
  try {
    const { page = 1, limit = 25, type } = req.query;
    const query = type ? { type } : {};
    const txs = await Transaction.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Transaction.countDocuments(query);
    res.json({ transactions: txs, total, page: Number(page) });
  } catch (err) { next(err); }
});

// ── Commissions ───────────────────────────────────────────────────────────────
router.get('/commissions',         ctrl.listCommissions);
router.get('/commissions/summary', ctrl.getCommissionSummary);
router.get('/level-rules',         ctrl.listLevelRules);
router.patch('/level-rules/:level',ctrl.updateLevelRule);

// ── Handbook & Level Rules ────────────────────────────────────────────────────
router.get('/handbook',       hbCtrl.adminList);
router.post('/handbook',      hbCtrl.create);
router.patch('/handbook/:id', hbCtrl.update);
router.delete('/handbook/:id',hbCtrl.remove);
router.put('/level-rules',    hbCtrl.updateLevelRules);

// ── Broadcast notifications ───────────────────────────────────────────────────
router.post('/broadcast', async (req, res, next) => {
  try {
    const { title, body, type = 'system', targetRole = 'worker' } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body are required.' });
    const users = await User.find({ role: targetRole, isActive: true }).select('_id');
    const docs  = users.map(u => ({ user: u._id, type, title, body }));
    await Notification.insertMany(docs);
    res.json({ message: `Broadcast sent to ${docs.length} users.` });
  } catch (err) { next(err); }
});

// ── Team & Referral overview ──────────────────────────────────────────────────
router.get('/team/leaderboard', teamCtrl.getLeaderboard);

// ── Settings ──────────────────────────────────────────────────────────────────
router.get('/settings',    ctrl.getSettings);
router.patch('/settings',  ctrl.updateSettings);

module.exports = router;
