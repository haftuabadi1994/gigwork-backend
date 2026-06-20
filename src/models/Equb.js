const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order:     { type: Number, default: 0 },
  hasWon:    { type: Boolean, default: false },
  joinedAt:  { type: Date, default: Date.now },
  status:    { type: String, enum: ['active', 'kicked', 'replaced', 'completed'], default: 'active' },
}, { _id: false });

const waitlistSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  joinedAt:  { type: Date, default: Date.now },
}, { _id: false });

const equbSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 500 },

  type:        { type: String, enum: ['rotation', 'lottery'], required: true },
  managedBy:   { type: String, enum: ['admin', 'creator'], default: 'creator' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  contributionETB:  { type: Number, required: true, min: 10 },
  maxMembers:       { type: Number, required: true, min: 2, max: 200 },
  schedule:         { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  contributionMode: { type: String, enum: ['auto', 'manual', 'both'], default: 'both' },
  payoutMethod:     { type: String, enum: ['wallet', 'bank', 'both'], default: 'wallet' },

  missedPolicy:  { type: String, enum: ['kick', 'penalize', 'replace'], default: 'penalize' },
  penaltyETB:    { type: Number, default: 0, min: 0 },

  status:       { type: String, enum: ['open', 'active', 'completed', 'cancelled'], default: 'open' },
  currentRound: { type: Number, default: 0 },
  totalRounds:  { type: Number, default: 0 },

  startDate:     { type: Date },
  nextRoundDate: { type: Date },

  members:   [memberSchema],
  waitlist:  [waitlistSchema],

  totalPotETB:    { type: Number, default: 0 },
  totalPayoutETB: { type: Number, default: 0 },
}, { timestamps: true });

// Virtual: current member count
equbSchema.virtual('memberCount').get(function () {
  return this.members.filter(m => m.status === 'active').length;
});

// Virtual: pot per round
equbSchema.virtual('roundPotETB').get(function () {
  return this.contributionETB * this.members.filter(m => m.status === 'active').length;
});

equbSchema.index({ status: 1 });
equbSchema.index({ createdBy: 1 });
equbSchema.index({ nextRoundDate: 1, status: 1 });

module.exports = mongoose.model('Equb', equbSchema);
