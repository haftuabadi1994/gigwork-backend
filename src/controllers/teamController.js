const User = require('../models/User');
const Transaction = require('../models/Transaction');
const TaskAssignment = require('../models/TaskAssignment');

// GET /api/team/stats
exports.getTeamStats = async (req, res, next) => {
  try {
    const uid = req.user._id;

    // Level A: directly referred
    const levelA = await User.find({ referredBy: uid }).select('name email level tasksCompleted totalEarnedETB createdAt lastActiveAt isActive referralCount');

    // Level B: referred by A members
    const aIds = levelA.map(u => u._id);
    const levelB = await User.find({ referredBy: { $in: aIds } }).select('name email level tasksCompleted totalEarnedETB createdAt lastActiveAt isActive referredBy');

    // Level C: referred by B members
    const bIds = levelB.map(u => u._id);
    const levelC = await User.find({ referredBy: { $in: bIds } }).select('name email level tasksCompleted totalEarnedETB createdAt lastActiveAt isActive referredBy');

    const sevenDaysAgo = new Date(Date.now() - 7 * 864e5);
    const allMemberIds = [...aIds, ...bIds, ...levelC.map(u => u._id)];

    const [activeCount, teamEarningsToday] = await Promise.all([
      User.countDocuments({ _id: { $in: allMemberIds }, lastActiveAt: { $gte: sevenDaysAgo } }),
      Transaction.aggregate([
        { $match: { user: { $in: allMemberIds }, type: 'task_earning', createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } } },
        { $group: { _id: null, total: { $sum: '$amountETB' } } }
      ])
    ]);

    res.json({
      summary: {
        totalMembers: allMemberIds.length,
        activeMembers: activeCount,
        directReferrals: levelA.length,
        levelBCount: levelB.length,
        levelCCount: levelC.length,
        teamEarningsToday: teamEarningsToday[0]?.total || 0
      },
      levelA,
      levelB: levelB.map(u => ({ ...u.toObject(), referredByName: levelA.find(a => a._id.equals(u.referredBy))?.name || '' })),
      levelC: levelC.map(u => ({ ...u.toObject(), referredByName: levelB.find(b => b._id.equals(u.referredBy))?.name || '' }))
    });
  } catch (err) { next(err); }
};

// GET /api/team/leaderboard
exports.getLeaderboard = async (req, res, next) => {
  try {
    // Top referrers on the whole platform
    const top = await User.find({ role: 'worker', referralCount: { $gt: 0 } })
      .sort({ referralCount: -1, totalEarnedETB: -1 })
      .limit(20)
      .select('name referralCount totalEarnedETB tasksCompleted level');
    res.json({ leaderboard: top });
  } catch (err) { next(err); }
};
