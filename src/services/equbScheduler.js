const Equb            = require('../models/Equb');
const EqubRound       = require('../models/EqubRound');
const EqubTransaction = require('../models/EqubTransaction');
const { debitWallet } = require('../utils/wallet');
const { notify }      = require('../controllers/notificationController');
const { triggerPayout } = require('../controllers/equbController');

/**
 * Run every hour via cron.
 * 1. Find all active Equbs where nextRoundDate <= now
 * 2. Auto-deduct contributions from wallets (auto/both mode)
 * 3. Apply missed contribution policies
 * 4. Trigger payout
 */
async function processEqubRounds() {
  console.log('[equbScheduler] Running at', new Date().toISOString());
  try {
    const now   = new Date();
    const equbs = await Equb.find({ status: 'active', nextRoundDate: { $lte: now } });

    for (const equb of equbs) {
      const round = await EqubRound.findOne({ equb: equb._id, status: 'collecting' });
      if (!round) continue;

      console.log(`[equbScheduler] Processing equb=${equb.name} round=${round.roundNumber}`);

      for (const contrib of round.contributions) {
        if (contrib.status !== 'pending') continue;

        // Auto-deduct if mode allows
        if (equb.contributionMode === 'auto' || equb.contributionMode === 'both') {
          try {
            await debitWallet({
              userId:    contrib.user,
              amountETB: equb.contributionETB,
              type:      'adjustment',
              description: `Auto Equb contribution — ${equb.name} Round ${round.roundNumber}`,
            });
            contrib.status = 'paid';
            contrib.paidAt = new Date();
            contrib.method = 'auto';
            round.potETB   = (round.potETB || 0) + equb.contributionETB;

            await EqubTransaction.create({
              equb: equb._id, round: round._id,
              user: contrib.user, type: 'contribution',
              amountETB: equb.contributionETB, status: 'completed',
              note: `Round ${round.roundNumber} auto-deduction`,
            });

            await notify(contrib.user, 'equb', 'Equb contribution deducted',
              `${equb.contributionETB} ETB was automatically deducted for ${equb.name} Round ${round.roundNumber}.`);

          } catch (e) {
            // Wallet likely insufficient — treat as missed
            contrib.status = 'missed';
            await applyMissedPolicy(equb, round, contrib);
          }
        } else {
          // Manual only — check if due date passed without payment
          contrib.status = 'missed';
          await applyMissedPolicy(equb, round, contrib);
        }
      }

      await round.save();
      await equb.save();

      // Trigger payout
      await triggerPayout(equb, round);
    }
  } catch (err) {
    console.error('[equbScheduler] Error:', err.message);
  }
}

async function applyMissedPolicy(equb, round, contrib) {
  if (equb.missedPolicy === 'penalize' && equb.penaltyETB > 0) {
    try {
      await debitWallet({
        userId: contrib.user, amountETB: equb.penaltyETB,
        type: 'adjustment',
        description: `Equb missed contribution penalty — ${equb.name} Round ${round.roundNumber}`,
      });
      await EqubTransaction.create({
        equb: equb._id, round: round._id,
        user: contrib.user, type: 'penalty',
        amountETB: equb.penaltyETB, status: 'completed',
      });
      contrib.status = 'penalized';
    } catch (e) { /* ignore if wallet empty */ }
    await notify(contrib.user, 'equb', 'Missed Equb contribution ⚠️',
      `You missed your contribution to ${equb.name} and were penalized ${equb.penaltyETB} ETB.`);

  } else if (equb.missedPolicy === 'kick' || equb.missedPolicy === 'replace') {
    const member = equb.members.find(m => String(m.user) === String(contrib.user));
    if (member) member.status = equb.missedPolicy === 'replace' ? 'replaced' : 'kicked';

    // Promote from waitlist
    if (equb.waitlist.length > 0) {
      const next = equb.waitlist.shift();
      equb.members.push({ user: next.user, order: member?.order || 99, status: 'active' });
      round.contributions.push({ user: next.user, amountETB: equb.contributionETB, status: 'pending' });
      await notify(next.user, 'equb', 'You joined an Equb! 🎉',
        `You were promoted from the waitlist of ${equb.name}.`);
    }

    await notify(contrib.user, 'equb', 'Removed from Equb',
      `You missed your contribution to ${equb.name} and were removed.`);
  }
}

module.exports = { processEqubRounds };
