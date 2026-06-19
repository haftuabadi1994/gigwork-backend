const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
  phone: { type: String, trim: true, sparse: true },
  password: { type: String, required: true, minlength: 6, select: false },
  avatar: { type: String, default: null },
  role: { type: String, enum: ['worker', 'admin'], default: 'worker' },

  // Level system: intern, job1 … job10
  level: { type: String, enum: ['intern','job1','job2','job3','job4','job5','job6','job7','job8','job9','job10'], default: 'intern' },

  isVerified: { type: Boolean, default: false },
  isActive:   { type: Boolean, default: true },

  // Referral
  referralCode: { type: String, unique: true, sparse: true },
  referredBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referralCount:{ type: Number, default: 0 },

  // Wallets (ETB)
  incomeWalletETB:   { type: Number, default: 0, min: 0 }, // task + referral earnings
  personalWalletETB: { type: Number, default: 0, min: 0 }, // deposits / recharges
  workDepositETB:    { type: Number, default: 0, min: 0 }, // locked collateral

  // Totals
  totalEarnedETB:         { type: Number, default: 0 },
  totalReferralBonusETB:  { type: Number, default: 0 },
  totalTeamBonusETB:      { type: Number, default: 0 },

  // Stats
  tasksCompleted:  { type: Number, default: 0 },
  qualityScore:    { type: Number, default: 100, min: 0, max: 100 },
  lastActiveAt:    { type: Date, default: Date.now },

  // Notification preferences
  notifPrefs: {
    tasks:      { type: Boolean, default: true },
    income:     { type: Boolean, default: true },
    referrals:  { type: Boolean, default: true },
    wallet:     { type: Boolean, default: true },
    team:       { type: Boolean, default: true }
  }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.pre('save', async function (next) {
  if (this.isNew && !this.referralCode) {
    const { v4: uuidv4 } = require('uuid');
    this.referralCode = 'GW-' + uuidv4().substring(0, 6).toUpperCase();
  }
  next();
});

userSchema.methods.comparePassword = async function (pwd) {
  return bcrypt.compare(pwd, this.password);
};

// backward compat: balanceETB = incomeWalletETB
userSchema.virtual('balanceETB').get(function() { return this.incomeWalletETB; });

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id, name: this.name, email: this.email, phone: this.phone,
    avatar: this.avatar, role: this.role, level: this.level,
    referralCode: this.referralCode, referralCount: this.referralCount,
    incomeWalletETB: this.incomeWalletETB,
    personalWalletETB: this.personalWalletETB,
    workDepositETB: this.workDepositETB,
    balanceETB: this.incomeWalletETB,
    totalEarnedETB: this.totalEarnedETB,
    totalReferralBonusETB: this.totalReferralBonusETB,
    totalTeamBonusETB: this.totalTeamBonusETB,
    tasksCompleted: this.tasksCompleted,
    qualityScore: this.qualityScore,
    isVerified: this.isVerified, isActive: this.isActive,
    notifPrefs: this.notifPrefs,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);
