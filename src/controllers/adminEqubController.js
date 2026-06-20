const Equb            = require('../models/Equb');
const EqubRound       = require('../models/EqubRound');
const EqubTransaction = require('../models/EqubTransaction');
const { creditWallet, debitWallet } = require('../utils/wallet');
const { notify }      = require('./notificationController');
const { triggerPayout } = require('./equbController');

// ── GET /api/admin/equb ──────────────────────────────────────────────────────
exports.listEqubs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, type } = req.query;
    const query = {};
    if (status) query.status = status;
    if (type)   query.type   = type;

    const equbs = await Equb.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('createdBy', 'name email');

    const total = await Equb.countDocuments(query);

    const [totalPot, totalPaid, activeCount] = await Promise.all([
      Equb.aggregate([{ $group: { _id: null, total: { $sum: '$totalPotETB' } } }]),
      Equb.aggregate([{ $group: { _id: null, total: { $sum: '$totalPayoutETB' } } }]),
      Equb.countDocuments({ status: 'active' }),
    ]);

    res.json({
      equbs, total,
      summary: {
        totalPotETB:    totalPot[0]?.total  || 0,
        totalPayoutETB: totalPaid[0]?.total || 0,
        activeGroups:   activeCount,
        totalGroups:    await Equb.countDocuments(),
      }
    });
  } catch (err) { next(err); }
};

// ── GET /api/admin/equb/:id ──────────────────────────────────────────────────
exports.getEqub = async (req, res, next) => {
  try {
    const equb = await Equb.findById(req.params.id)
      .populate('members.user', 'name email level')
      .populate('createdBy', 'name email')
      .populate('waitlist.user', 'name email');
    if (!equb) return res.status(404).json({ error: 'Equb not found.' });

    const rounds = await EqubRound.find({ equb: equb._id })
      .sort({ roundNumber: -1 })
      .populate('winner', 'name')
      .populate('contributions.user', 'name');

    const txs = await EqubTransaction.find({ equb: equb._id })
      .sort({ createdAt: -1 }).limit(50)
      .populate('user', 'name');

    res.json({ equb, rounds, transactions: txs });
  } catch (err) { next(err); }
};

// ── POST /api/admin/equb ─────────────────────────────────────────────────────
exports.createEqub = async (req, res, next) => {
  try {
    const equb = await Equb.create({ ...req.body, createdBy: req.user._id, managedBy: 'admin' });
    res.status(201).json({ message: 'Equb created.', equb });
  } catch (err) { next(err); }
};

// ── PATCH /api/admin/equb/:id ────────────────────────────────────────────────
exports.updateEqub = async (req, res, next) => {
  try {
    const allowed = ['name', 'description', 'status', 'missedPolicy', 'penaltyETB', 'contributionMode', 'payoutMethod', 'nextRoundDate'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const equb = await Equb.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!equb) return res.status(404).json({ error: 'Equb not found.' });
    res.json({ message: 'Equb updated.', equb });
  } catch (err) { next(err); }
};

// ── POST /api/admin/equb/:id/start ───────────────────────────────────────────
exports.startEqub = async (req, res, next) => {
  try {
    const equb = await Equb.findById(req.params.id);
    if (!equb) return res.status(404).json({ error: 'Equb not found.' });
    if (equb.status !== 'open') return res.status(400).json({ error: 'Equb is not in open status.' });
    if (equb.members.filter(m => m.status === 'active').length < 2)
      return res.status(400).json({ error: 'Need at least 2 members to start.' });

    equb.status        = 'active';
    equb.startDate     = new Date();
    equb.currentRound  = 1;

    const d = new Date();
    if (equb.schedule === 'daily')   d.setDate(d.getDate() + 1);
    if (equb.schedule === 'weekly')  d.setDate(d.getDate() + 7);
    if (equb.schedule === 'monthly') d.setMonth(d.getMonth() + 1);
    equb.nextRoundDate = d;
    await equb.save();

    const activeMembers = equb.members.filter(m => m.status === 'active');
    const assignedTo    = equb.type === 'rotation' ? activeMembers[0]?.user : null;
    await EqubRound.create({
      equb: equb._id, roundNumber: 1,
      dueDate: d, assignedTo,
      contributions: activeMembers.map(m => ({ user: m.user, amountETB: equb.contributionETB, status: 'pending' })),
      status: 'collecting',
    });

    for (const m of activeMembers) {
      await notify(m.user, 'equb', 'Equb started! 🎉',
        `${equb.name} has been started by admin. First contribution due ${d.toLocaleDateString()}.`);
    }

    res.json({ message: 'Equb started.', equb });
  } catch (err) { next(err); }
};

// ── POST /api/admin/equb/:id/force-round ─────────────────────────────────────
exports.forceRound = async (req, res, next) => {
  try {
    const equb  = await Equb.findById(req.params.id);
    if (!equb) return res.status(404).json({ error: 'Equb not found.' });
    const round = await EqubRound.findOne({ equb: equb._id, status: 'collecting' });
    if (!round) return res.status(400).json({ error: 'No active round to force.' });

    // Mark all unpaid as missed
    for (const c of round.contributions) {
      if (c.status === 'pending') {
        c.status = 'missed';
        // Apply missed policy
        if (equb.missedPolicy === 'penalize' && equb.penaltyETB > 0) {
          try {
            await debitWallet({ userId: c.user, amountETB: equb.penaltyETB, type: 'adjustment', description: `Equb penalty — missed contribution Round ${round.roundNumber}` });
            await EqubTransaction.create({ equb: equb._id, round: round._id, user: c.user, type: 'penalty', amountETB: equb.penaltyETB, status: 'completed' });
            c.status = 'penalized';
          } catch (e) { /* wallet may be empty */ }
        } else if (equb.missedPolicy === 'kick' || equb.missedPolicy === 'replace') {
          const member = equb.members.find(m => String(m.user) === String(c.user));
          if (member) member.status = equb.missedPolicy === 'replace' ? 'replaced' : 'kicked';
          // Promote from waitlist
          if (equb.waitlist.length > 0) {
            const next = equb.waitlist.shift();
            equb.members.push({ user: next.user, order: member?.order || 99, status: 'active' });
            round.contributions.push({ user: next.user, amountETB: equb.contributionETB, status: 'pending' });
            await notify(next.user, 'equb', 'You joined an Equb!', `You were promoted from the waitlist of ${equb.name}.`);
          }
          await notify(c.user, 'equb', 'Removed from Equb', `You missed your contribution to ${equb.name} and were ${member?.status}.`);
        }
      }
    }

    // Calculate actual pot from paid contributions
    round.potETB = round.contributions.filter(c => c.status === 'paid').length * equb.contributionETB;
    await round.save();
    await equb.save();

    await triggerPayout(equb, round);

    res.json({ message: 'Round forced and payout triggered.' });
  } catch (err) { next(err); }
};

// ── POST /api/admin/equb/:id/kick/:userId ────────────────────────────────────
exports.kickMember = async (req, res, next) => {
  try {
    const equb = await Equb.findById(req.params.id);
    if (!equb) return res.status(404).json({ error: 'Equb not found.' });

    const member = equb.members.find(m => String(m.user) === String(req.params.userId));
    if (!member) return res.status(404).json({ error: 'Member not found.' });

    member.status = 'kicked';

    // Promote from waitlist
    if (equb.waitlist.length > 0) {
      const next = equb.waitlist.shift();
      equb.members.push({ user: next.user, order: member.order, status: 'active' });
      await notify(next.user, 'equb', 'You joined an Equb!', `You were promoted from the waitlist of ${equb.name}.`);
    }

    await equb.save();
    await notify(member.user, 'equb', 'Removed from Equb', `You were removed from ${equb.name} by admin.`);

    res.json({ message: 'Member kicked.' });
  } catch (err) { next(err); }
};

// ── DELETE /api/admin/equb/:id ───────────────────────────────────────────────
exports.cancelEqub = async (req, res, next) => {
  try {
    const equb = await Equb.findById(req.params.id);
    if (!equb) return res.status(404).json({ error: 'Equb not found.' });
    if (equb.status === 'completed') return res.status(400).json({ error: 'Cannot cancel a completed Equb.' });

    equb.status = 'cancelled';
    await equb.save();
    await EqubRound.updateMany({ equb: equb._id, status: 'collecting' }, { status: 'cancelled' });

    for (const m of equb.members.filter(m => m.status === 'active')) {
      await notify(m.user, 'equb', 'Equb cancelled', `${equb.name} has been cancelled by admin.`);
    }

    res.json({ message: 'Equb cancelled.' });
  } catch (err) { next(err); }
};
