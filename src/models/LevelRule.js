const mongoose = require('mongoose');

const levelRuleSchema = new mongoose.Schema({
  level: {
    type: String,
    enum: ['intern','job1','job2','job3','job4','job5','job6','job7','job8','job9','job10'],
    unique: true,
    required: true
  },
  label:               { type: String, required: true },          // e.g. "Entry-level worker"
  depositRequiredETB:  { type: Number, default: 0 },              // required deposit to unlock
  taskCountPerDay:     { type: Number, default: 5 },
  rewardPerTaskETB:    { type: Number, default: 22 },
  referralCommission:  { type: Number, default: 5 },              // %
  teamBonusPercent:    { type: Number, default: 0 },              // % of team income
  minTasksToAdvance:   { type: Number, default: 50 },
  minQualityScore:     { type: Number, default: 80 },
  color:               { type: String, default: '#1D9E75' },
  isActive:            { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('LevelRule', levelRuleSchema);
