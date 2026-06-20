const Equb            = require('../models/Equb');
const EqubRound       = require('../models/EqubRound');
const EqubTransaction = require('../models/EqubTransaction');
const User            = require('../models/User');
const { creditWallet, debitWallet } = require('../utils/wallet');
const { notify }      = require('./notificationController');

// ── helpers ──────────────────────────────────────────────────────────────────

function nextRoundDate(schedule, from = new Date()) {
  const d = new Date(from);
  if (schedule === 'daily')   d.setDate(d.getDate() + 1);
  if (schedule === 'weekly')  d.setDate(d.getDate() + 7);
  if (schedule === 'monthly') d.setMonth(d.getMonth() + 1);
  return d;
}

async function createFirstRound(equb) {
  const dueDate    = nextRoundDate(equb.schedule, equb.startDate);
  const activeMembers = equb.members.filter(m => m.status === 'active');

  // For rotation, assign to member with order=1
  const assignedTo = equb.type === 'rotation'
    ? (activeMembers.find(m => m.order === 1)?.user || null)
    : null;

  const contributions = activeMembers.map(m => ({
    user: m.user, amountETB: equb.contributionETB, status: 'pending'
  }));

  return EqubRound.create({
    equb: equb._id, roundNumber: 1,
    dueDate, assignedTo, contributions, status: 'collecting'
  });
}

// ── GET /api/equb/open ───────────────────────────────────────────────────────
exports.listOpen = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, schedule, type } = req.query;
    const query = { status: 'open' };
    if (schedule) query.schedule = schedule;
    if (type)     query.type     = type;

    const equbs = await Equb.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('createdBy', 'name level');

    const total = await Equb.countDocuments(query);
    res.json({ equbs, total });
  } catch (err) { next(err); }
};

// ── GET /api/equb/my ─────────────────────────────────────────────────────────
exports.myEqubs = async (req, res, next) => {
  try {
    const equbs = await Equb.find({ 'members.user': req.user._id })
      .sort({ updatedAt: -1 })
      .populate('createdBy', 'name');

    const withRound = await Promise.all(equbs.map(async eq => {
      const round = await EqubRound.findOne({ equb: eq._id, status: 'collecting' });
      const myContrib = round?.contributions.find(c => String(c.user) === String(req.user._id));
      return { ...eq.toObject(), currentRoundDoc: round, myContribution: myContrib };
    }));

    res.json({ equbs: withRound });
  } catch (err) { next(err); }
};

// ── GET /api/equb/:id ────────────────────────────────────────────────────────
exports.getEqub = async (req, res, next) => {
  try {
    const equb = await Equb.findById(req.params.id)
      .populate('members.user', 'name level avatar')
      .populate('createdBy', 'name');
    if (!equb) return res.status(404).json({ error: 'Equb not found.' });

    const rounds = await EqubRound.find({ equb: equb._id })
      .sort({ roundNumber: -1 })
      .limit(10)
      .populate('winner', 'name');

    const myTxs = await EqubTransaction.find({ equb: equb._id, user: req.user._id })
      .sort({ createdAt: -1 }).limit(20);

    res.json({ equb, rounds, myTransactions: myTxs });
  } catch (err) { next(err); }
};

// ── POST /api/equb/create ────────────────────────────────────────────────────
exports.createEqub = async (req, res, next) => {
  try {
    const {
      name, description, type, contributionETB, maxMembers,
      schedule, contributionMode, payoutMethod,
      missedPolicy, penaltyETB, startDate
    } = req.body;

    const equb = await Equb.create({
      name, description, type,
      contributionETB, maxMembers,
      schedule, contributionMode: contributionMode || 'both',
      payoutMethod: payoutMethod || 'wallet',
      missedPolicy: missedPolicy || 'penalize',
      penaltyETB:   penaltyETB   || 0,
      startDate:    startDate    || new Date(),
      totalRounds:  type === 'rotation' ? maxMembers : 0,
      createdBy:    req.user._id,
      managedBy:    'creator',
      status:       'open',
      // creator auto-joins as member #1
      members: [{ user: req.user._id, order: 1, status: 'active' }],
    });

    res.status(201).json({ message: 'Equb created.', equb });
  } catch (err) { next(err); }
};

// ── POST /api/equb/:id/join ──────────────────────────────────────────────────
exports.joinEqub = async (req, res, next) => {
  try {
    const equb = await Equb.findById(req.params.id);
    if (!equb) return res.status(404).json({ error: 'Equb not found.' });
    if (equb.status !== 'open') return res.status(400).json({ error: 'This Equb is not accepting members.' });

    const alreadyMember = equb.members.some(m => String(m.user) === String(req.user._id) && m.status === 'active');
    if (alreadyMember) return res.status(400).json({ error: 'You are already a member.' });

    const activeCount = equb.members.filter(m => m.status === 'active').length;

    if (activeCount >= equb.maxMembers) {
      // Add to waitlist
      const onWaitlist = equb.waitlist.some(w => String(w.user) === String(req.user._id));
      if (onWaitlist) return res.status(400).json({ error: 'You are already on the waitlist.' });
      equb.waitlist.push({ user: req.user._id });
      await equb.save();
      return res.json({ message: 'Added to waitlist.' });
    }

    const order = activeCount + 1;
    equb.members.push({ user: req.user._id, order, status: 'active' });

    // Auto-start if full
    if (order === equb.maxMembers) {
      equb.status    = 'active';
      equb.startDate = equb.startDate || new Date();
      equb.nextRoundDate = nextRoundDate(equb.schedule, equb.startDate);
      await equb.save();
      await createFirstRound(equb);
      // Notify all members
      for (const m of equb.members) {
        await notify(m.user, 'equb', 'Equb started! 🎉',
          `${equb.name} is now full and has started. First round due ${equb.nextRoundDate.toLocaleDateString()}.`);
      }
    } else {
      await equb.save();
    }

    res.json({ message: 'Joined successfully.', equb });
  } catch (err) { next(err); }
};

// ── POST /api/equb/:id/contribute ────────────────────────────────────────────
exports.contribute = async (req, res, next) => {
  try {
    const equb = await Equb.findById(req.params.id);
    if (!equb) return res.status(404).json({ error: 'Equb not found.' });
    if (equb.status !== 'active') return res.status(400).json({ error: 'Equb is not active.' });

    const isMember = equb.members.some(m => String(m.user) === String(req.user._id) && m.status === 'active');
    if (!isMember) return res.status(403).json({ error: 'You are not a member of this Equb.' });

    const round = await EqubRound.findOne({ equb: equb._id, status: 'collecting' });
    if (!round) return res.status(400).json({ error: 'No active round to contribute to.' });

    const contrib = round.contributions.find(c => String(c.user) === String(req.user._id));
    if (!contrib) return res.status(400).json({ error: 'No contribution record found.' });
    if (contrib.status === 'paid') return res.status(400).json({ error: 'You have already contributed this round.' });

    // Debit wallet
    await debitWallet({
      userId: req.user._id,
      amountETB: equb.contributionETB,
      type: 'adjustment',
      description: `Equb contribution — ${equb.name} Round ${round.roundNumber}`,
    });

    // Mark as paid
    contrib.status = 'paid';
    contrib.paidAt = new Date();
    contrib.method = 'manual';

    // Update pot
    round.potETB = (round.potETB || 0) + equb.contributionETB;
    await round.save();

    // Log equb transaction
    await EqubTransaction.create({
      equb: equb._id, round: round._id,
      user: req.user._id,
      type: 'contribution',
      amountETB: equb.contributionETB,
      status: 'completed',
      note: `Round ${round.roundNumber} manual contribution`,
    });

    // Check if all paid → trigger payout
    const allPaid = round.contributions.every(c => c.status === 'paid');
    if (allPaid) {
      await triggerPayout(equb, round);
    }

    res.json({ message: `Contributed ${equb.contributionETB} ETB successfully.` });
  } catch (err) { next(err); }
};

// ── POST /api/equb/:id/leave ─────────────────────────────────────────────────
exports.leaveEqub = async (req, res, next) => {
  try {
    const equb = await Equb.findById(req.params.id);
    if (!equb) return res.status(404).json({ error: 'Equb not found.' });
    if (equb.status === 'active') return res.status(400).json({ error: 'Cannot leave an active Equb.' });

    equb.members = equb.members.filter(m => String(m.user) !== String(req.user._id));
    await equb.save();
    res.json({ message: 'Left the Equb.' });
  } catch (err) { next(err); }
};

// ── internal: trigger payout ─────────────────────────────────────────────────
async function triggerPayout(equb, round) {
  try {
    // Pick winner
    let winnerId;
    if (equb.type === 'rotation') {
      winnerId = round.assignedTo;
    } else {
      // Lottery: random from members who haven't won
      const eligible = equb.members.filter(m => m.status === 'active' && !m.hasWon);
      winnerId = eligible[Math.floor(Math.random() * eligible.length)]?.user;
    }

    if (!winnerId) return;

    // Credit winner
    await creditWallet({
      userId: winnerId,
      amountETB: round.potETB,
      type: 'adjustment',
      description: `Equb payout — ${equb.name} Round ${round.roundNumber}`,
    });

    // Log payout transaction
    await EqubTransaction.create({
      equb: equb._id, round: round._id,
      user: winnerId,
      type: 'payout',
      amountETB: round.potETB,
      status: 'completed',
      note: `Round ${round.roundNumber} winner payout`,
    });

    // Mark winner
    const winnerMember = equb.members.find(m => String(m.user) === String(winnerId));
    if (winnerMember) winnerMember.hasWon = true;

    // Close round
    round.winner   = winnerId;
    round.status   = 'completed';
    round.paidOutAt = new Date();
    await round.save();

    // Advance equb
    equb.currentRound  += 1;
    equb.totalPayoutETB = (equb.totalPayoutETB || 0) + round.potETB;

    const allWon = equb.members.filter(m => m.status === 'active').every(m => m.hasWon);
    if (allWon || (equb.type === 'rotation' && equb.currentRound >= equb.totalRounds)) {
      equb.status = 'completed';
    } else {
      // Create next round
      equb.nextRoundDate = nextRoundDate(equb.schedule);
      await equb.save();

      const nextOrder    = (equb.currentRound % equb.members.filter(m => m.status === 'active').length) + 1;
      const nextAssigned = equb.type === 'rotation'
        ? equb.members.find(m => m.order === nextOrder && m.status === 'active')?.user
        : null;

      const contributions = equb.members
        .filter(m => m.status === 'active')
        .map(m => ({ user: m.user, amountETB: equb.contributionETB, status: 'pending' }));

      await EqubRound.create({
        equb: equb._id,
        roundNumber: equb.currentRound + 1,
        dueDate: equb.nextRoundDate,
        assignedTo: nextAssigned,
        contributions,
        status: 'collecting',
      });
    }

    await equb.save();

    // Notify winner
    await notify(winnerId, 'equb', '🎉 You won the Equb pot!',
      `You received ${round.potETB.toLocaleString()} ETB from ${equb.name} Round ${round.roundNumber}.`);

    // Notify all members
    for (const m of equb.members.filter(m => m.status === 'active')) {
      if (String(m.user) !== String(winnerId)) {
        await notify(m.user, 'equb', 'Equb round complete',
          `Round ${round.roundNumber} of ${equb.name} is done. Next round starts soon.`);
      }
    }
  } catch (err) {
    console.error('triggerPayout error:', err.message);
  }
}

exports.triggerPayout = triggerPayout;
