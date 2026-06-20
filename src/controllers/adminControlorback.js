const User = require('../models/User');
const Task = require('../models/Task');
const TaskAssignment = require('../models/TaskAssignment');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const Deposit = require('../models/Deposit');
const { creditWallet, debitWallet } = require('../utils/wallet');

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

exports.getDashboard = async (req, res, next) => {
  try {
    const [
      totalUsers, activeUsers, totalTasks, activeTasks,
      totalAssignments, completedAssignments,
      pendingWithdrawals, totalWithdrawnResult,
      recentUsers, recentTxs,
      pendingDeposits, totalDeposited
    ] = await Promise.all([
      User.countDocuments({ role: 'worker' }),
      User.countDocuments({ role: 'worker', lastActiveAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
      Task.countDocuments(),
      Task.countDocuments({ isActive: true }),
      TaskAssignment.countDocuments(),
      TaskAssignment.countDocuments({ status: 'completed' }),
      Withdrawal.countDocuments({ status: 'pending' }),
      Withdrawal.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amountETB' } } }]),
      User.find({ role: 'worker' }).sort({ createdAt: -1 }).limit(5).select('name email createdAt tasksCompleted'),
      Transaction.find().sort({ createdAt: -1 }).limit(10).populate('user', 'name'),
      Deposit.countDocuments({ status: 'pending' }),
      Deposit.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amountETB' } } }])
    ]);

    // Daily earnings last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const dailyEarnings = await Transaction.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo }, type: 'task_earning' } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$amountETB' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      stats: {
        totalUsers, activeUsers, totalTasks, activeTasks,
        totalAssignments, completedAssignments,
        pendingWithdrawals,
        totalWithdrawnETB: totalWithdrawnResult[0]?.total || 0,
        pendingDeposits,
        totalDepositedETB: totalDeposited[0]?.total || 0,
        completionRate: totalAssignments ? Math.round(completedAssignments / totalAssignments * 100) : 0
      },
      recentUsers,
      recentTxs,
      dailyEarnings
    });
  } catch (err) { next(err); }
};

// ─── USERS ────────────────────────────────────────────────────────────────────

exports.listUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const query = {};
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
    if (role) query.role = role;
    if (status === 'active') query.isActive = true;
    if (status === 'banned') query.isActive = false;

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-password');

    const total = await User.countDocuments(query);
    res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const [assignments, txs] = await Promise.all([
      TaskAssignment.find({ user: user._id }).populate('task', 'title earningETB category').sort({ createdAt: -1 }).limit(20),
      Transaction.find({ user: user._id }).sort({ createdAt: -1 }).limit(20)
    ]);

    res.json({ user, assignments, transactions: txs });
  } catch (err) { next(err); }
};

exports.updateUser = async (req, res, next) => {
  try {
    const allowed = ['name', 'email', 'phone', 'role', 'isActive', 'isVerified', 'level', 'qualityScore'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'User updated', user });
  } catch (err) { next(err); }
};

exports.adjustWallet = async (req, res, next) => {
  try {
    const { amountETB, type, description } = req.body;
    if (!amountETB || !description) return res.status(400).json({ error: 'amountETB and description required.' });

    if (amountETB > 0) {
      await creditWallet({ userId: req.params.id, amountETB, type: 'adjustment', description });
    } else {
      await debitWallet({ userId: req.params.id, amountETB: Math.abs(amountETB), type: 'adjustment', description });
    }
    const user = await User.findById(req.params.id).select('balanceETB');
    res.json({ message: 'Wallet adjusted', newBalanceETB: user.balanceETB });
  } catch (err) { next(err); }
};

exports.deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) return res.status(400).json({ error: 'Cannot delete yourself.' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted.' });
  } catch (err) { next(err); }
};

// ─── TASKS ────────────────────────────────────────────────────────────────────

exports.adminListTasks = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, category, status } = req.query;
    const query = {};
    if (search) query.title = { $regex: search, $options: 'i' };
    if (category) query.category = category;
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;

    const tasks = await Task.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('createdBy', 'name');

    const total = await Task.countDocuments(query);
    res.json({ tasks, total, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

exports.createTask = async (req, res, next) => {
  try {
    const task = await Task.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ message: 'Task created', task });
  } catch (err) { next(err); }
};

exports.updateTask = async (req, res, next) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    res.json({ message: 'Task updated', task });
  } catch (err) { next(err); }
};

exports.deleteTask = async (req, res, next) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    await TaskAssignment.deleteMany({ task: req.params.id });
    res.json({ message: 'Task deleted.' });
  } catch (err) { next(err); }
};

exports.getTaskSubmissions = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { task: req.params.id };
    if (status) query.status = status;
    const subs = await TaskAssignment.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    res.json({ submissions: subs });
  } catch (err) { next(err); }
};

exports.reviewSubmission = async (req, res, next) => {
  try {
    const { action, reviewNote } = req.body; // action: 'approve' | 'reject'
    const assignment = await TaskAssignment.findById(req.params.assignmentId).populate('task').populate('user');
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

    if (action === 'approve') {
      assignment.status = 'completed';
      assignment.progress = 100;
      assignment.earnedETB = assignment.task.earningETB;
      assignment.completedAt = new Date();
      assignment.reviewNote = reviewNote;
      await assignment.save();

      await creditWallet({
        userId: assignment.user._id,
        amountETB: assignment.task.earningETB,
        type: 'task_earning',
        description: `Approved: ${assignment.task.title}`,
        reference: assignment.task._id,
        referenceModel: 'Task'
      });
      await User.findByIdAndUpdate(assignment.user._id, { $inc: { tasksCompleted: 1 } });
      res.json({ message: 'Submission approved and payment sent.' });
    } else {
      assignment.status = 'rejected';
      assignment.reviewNote = reviewNote;
      await assignment.save();
      res.json({ message: 'Submission rejected.' });
    }
  } catch (err) { next(err); }
};

// ─── WITHDRAWALS ──────────────────────────────────────────────────────────────

exports.listWithdrawals = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = status ? { status } : {};
    const withdrawals = await Withdrawal.find(query)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Withdrawal.countDocuments(query);
    res.json({ withdrawals, total });
  } catch (err) { next(err); }
};

exports.processWithdrawal = async (req, res, next) => {
  try {
    const { action, adminNote } = req.body;
    const w = await Withdrawal.findById(req.params.id).populate('user');
    if (!w) return res.status(404).json({ error: 'Withdrawal not found.' });
    if (w.status !== 'pending') return res.status(400).json({ error: 'Already processed.' });

    if (action === 'complete') {
      w.status = 'completed';
      w.processedAt = new Date();
      w.adminNote = adminNote;
    } else if (action === 'reject') {
      // Refund the amount back to user's wallet
      await creditWallet({
        userId: w.user._id,
        amountETB: w.amountETB,
        type: 'adjustment',
        description: `Withdrawal refunded: ${adminNote || 'Rejected by admin'}`,
        reference: w._id,
        referenceModel: 'Withdrawal'
      });
      w.status = 'rejected';
      w.adminNote = adminNote;
    }
    await w.save();
    res.json({ message: `Withdrawal ${action}d successfully.` });
  } catch (err) { next(err); }
};

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

const Settings = require('../models/Settings');

exports.getSettings = async (req, res, next) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = await Settings.create({});
    res.json({ settings: s });
  } catch (err) { next(err); }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const s = await Settings.findOneAndUpdate({}, req.body, { new: true, upsert: true, runValidators: true });
    res.json({ message: 'Settings saved', settings: s });
  } catch (err) { next(err); }
};

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

exports.getAnalytics = async (req, res, next) => {
  try {
    const days = Number(req.query.days) || 30;
    const since = new Date(Date.now() - days * 86400000);

    const [signups, earnings, tasksByCategory, topEarners, withdrawalStats] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Transaction.aggregate([
        { $match: { createdAt: { $gte: since }, amountETB: { $gt: 0 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$amountETB' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      TaskAssignment.aggregate([
        { $match: { status: 'completed' } },
        { $lookup: { from: 'tasks', localField: 'task', foreignField: '_id', as: 'task' } },
        { $unwind: '$task' },
        { $group: { _id: '$task.category', count: { $sum: 1 }, totalETB: { $sum: '$earnedETB' } } },
        { $sort: { count: -1 } }
      ]),
      User.find({ role: 'worker' }).sort({ totalEarnedETB: -1 }).limit(10).select('name email totalEarnedETB tasksCompleted'),
      Withdrawal.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amountETB' } } }
      ])
    ]);

    res.json({ signups, earnings, tasksByCategory, topEarners, withdrawalStats });
  } catch (err) { next(err); }
};
