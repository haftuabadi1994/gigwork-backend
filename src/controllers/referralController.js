const User        = require('../models/User');
const Transaction = require('../models/Transaction');
const LevelRule   = require('../models/LevelRule');
const { creditWallet } = require('../utils/wallet');
const { notify }  = require('./notificationController');

// GET /api/referral/stats
exports.getReferralStats = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    // Level A referrals (direct)
    const referrals = await User.find({ referredBy: req.user._id })
      .select('name email createdAt tasksCompleted level')
      .sort({ createdAt: -1 });

    const bonusTransactions = await Transaction.find({
      user: req.user._id,
      type: 'referral_bonus'
    }).sort({ createdAt: -1 });

    // Level B (indirect)
    const aIds = referrals.map(r => r._id);
    const levelBCount = await User.countDocuments({ referredBy: { $in: aIds } });

    res.json({
      referralCode: user.referralCode,
      referralCount: user.referralCount,
      totalBonusETB: user.totalReferralBonusETB,
      referrals,
      bonusTransactions,
      levelBCount
    });
  } catch (err) { next(err); }
};

// GET /api/referral/validate/:code
exports.validateCode = async (req, res, next) => {
  try {
    const user = await User.findOne({ referralCode: req.params.code.toUpperCase() })
      .select('name referralCode level');
    if (!user) return res.status(404).json({ valid: false, error: 'Invalid referral code.' });
    res.json({ valid: true, referrerName: user.name, referrerLevel: user.level });
  } catch (err) { next(err); }
};

/**
 * Process all referral bonuses for a completed task.
 * Called from taskController after a task is approved.
 * - Level A (direct referrer): gets referralCommission% of earnedETB on first task
 * - Level B (indirect): gets teamBonusPercent% of earnedETB ongoing
 */
exports.processReferralBonuses = async ({ workerId, earnedETB, taskTitle }) => {
  try {
    const worker = await User.findById(workerId).select('referredBy name');
    if (!worker?.referredBy) return;

    // Level A: direct referrer
    const referrerA = await User.findById(worker.referredBy).select('level referredBy name referralCode');
    if (!referrerA) return;

    const ruleA = await LevelRule.findOne({ level: referrerA.level });
    const prevCompleted = await require('../models/TaskAssignment')
      .countDocuments({ user: workerId, status: 'completed' });

    // First task bonus for Tier A
    if (prevCompleted <= 1 && ruleA) {
      const bonusA = Math.round(earnedETB * ruleA.referralCommission / 100);
      if (bonusA > 0) {
        await creditWallet({
          userId: referrerA._id,
          amountETB: bonusA,
          type: 'referral_bonus',
          description: `Tier A referral bonus — ${worker.name} completed "${taskTitle}"`,
          reference: worker._id,
          referenceModel: 'User'
        });
        await User.findByIdAndUpdate(referrerA._id, { $inc: { totalReferralBonusETB: bonusA } });
        await notify(referrerA._id, 'referral_earned', 'Referral bonus earned! 🎁',
          `${worker.name} completed their first task. You earned ${bonusA} ETB!`, { bonus: bonusA });
      }
    }

    // Level B: referrer of the referrer gets team bonus
    if (referrerA.referredBy) {
      const referrerB = await User.findById(referrerA.referredBy).select('level name');
      if (referrerB) {
        const ruleB = await LevelRule.findOne({ level: referrerB.level });
        if (ruleB && ruleB.teamBonusPercent > 0) {
          const bonusB = Math.round(earnedETB * ruleB.teamBonusPercent / 100);
          if (bonusB > 0) {
            await creditWallet({
              userId: referrerB._id,
              amountETB: bonusB,
              type: 'referral_bonus',
              description: `Tier B team bonus — ${worker.name} earned via ${referrerA.name}`,
              reference: worker._id,
              referenceModel: 'User'
            });
            await User.findByIdAndUpdate(referrerB._id, { $inc: { totalReferralBonusETB: bonusB, totalTeamBonusETB: bonusB } });
          }
        }
      }
    }
  } catch (err) {
    console.error('processReferralBonuses error:', err.message);
  }
};
