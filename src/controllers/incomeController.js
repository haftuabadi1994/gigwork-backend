const Transaction = require('../models/Transaction');
const TaskAssignment = require('../models/TaskAssignment');
const User = require('../models/User');
const LevelRule = require('../models/LevelRule');

const startOf = (unit) => {
  const d = new Date();
  if (unit === 'today')  { d.setHours(0,0,0,0); return d; }
  if (unit === 'yesterday') { d.setDate(d.getDate()-1); d.setHours(0,0,0,0); return d; }
  if (unit === 'week')   { d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d; }
  if (unit === 'month')  { d.setDate(1); d.setHours(0,0,0,0); return d; }
};
const endOf = (unit) => {
  const d = new Date();
  if (unit === 'yesterday') { d.setHours(23,59,59,999); d.setDate(d.getDate()-1); return d; }
  return new Date();
};

const sumTx = async (userId, from, to) => {
  const res = await Transaction.aggregate([
    { $match: { user: userId, amountETB: { $gt: 0 }, createdAt: { $gte: from, $lte: to }, type: { $in: ['task_earning','referral_bonus','adjustment'] } } },
    { $group: { _id: null, total: { $sum: '$amountETB' } } }
  ]);
  return res[0]?.total || 0;
};

// GET /api/income/summary
exports.getSummary = async (req, res, next) => {
  try {
    const uid = req.user._id;
    const now = new Date();
    const todayStart    = startOf('today');
    const yesterdayStart = startOf('yesterday');
    const yesterdayEnd  = endOf('yesterday');
    const weekStart     = startOf('week');
    const monthStart    = startOf('month');

    const [todayIncome, yesterdayIncome, weekIncome, monthIncome] = await Promise.all([
      sumTx(uid, todayStart, now),
      sumTx(uid, yesterdayStart, yesterdayEnd),
      sumTx(uid, weekStart, now),
      sumTx(uid, monthStart, now)
    ]);

    // Recommended income: level's daily tasks × reward
    const user = await User.findById(uid);
    const rule = await LevelRule.findOne({ level: user.level });
    const recommendedDaily = rule ? rule.taskCountPerDay * rule.rewardPerTaskETB : 0;

    // Team income: sum earnings of all A/B/C level referrals today
    const teamMembers = await User.find({ referredBy: uid }).select('_id');
    const teamIds = teamMembers.map(m => m._id);
    const teamTodayIncome = await Transaction.aggregate([
      { $match: { user: { $in: teamIds }, amountETB: { $gt: 0 }, createdAt: { $gte: todayStart }, type: 'task_earning' } },
      { $group: { _id: null, total: { $sum: '$amountETB' } } }
    ]);

    // 30-day chart
    const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5);
    const dailyChart = await Transaction.aggregate([
      { $match: { user: uid, amountETB: { $gt: 0 }, createdAt: { $gte: thirtyDaysAgo }, type: { $in: ['task_earning','referral_bonus'] } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$amountETB' } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      todayIncome,
      yesterdayIncome,
      weekIncome,
      monthIncome,
      recommendedDailyIncome: recommendedDaily,
      teamTodayIncome: teamTodayIncome[0]?.total || 0,
      totalEarned: user.totalEarnedETB,
      incomeWalletETB: user.incomeWalletETB,
      personalWalletETB: user.personalWalletETB,
      level: user.level,
      rule: rule || null,
      dailyChart
    });
  } catch (err) { next(err); }
};
