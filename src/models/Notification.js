const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['task_assigned','task_completed','task_rejected','task_deadline',
           'income_update','withdrawal_processed','deposit_approved','deposit_rejected',
           'referral_joined','referral_earned','team_activity',
           'level_upgrade','system','recharge_confirmed'],
    required: true
  },
  title:   { type: String, required: true },
  body:    { type: String, required: true },
  isRead:  { type: Boolean, default: false, index: true },
  data:    { type: mongoose.Schema.Types.Mixed, default: {} } // extra payload (taskId, amount, etc.)
}, { timestamps: true });

notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
