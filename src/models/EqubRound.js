const mongoose = require('mongoose');

const contributionSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amountETB: { type: Number, required: true },
  paidAt:    { type: Date },
  method:    { type: String, enum: ['auto', 'manual'], default: 'manual' },
  status:    { type: String, enum: ['pending', 'paid', 'missed', 'penalized'], default: 'pending' },
}, { _id: false });

const equbRoundSchema = new mongoose.Schema({
  equb:        { type: mongoose.Schema.Types.ObjectId, ref: 'Equb', required: true, index: true },
  roundNumber: { type: Number, required: true },

  winner:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  potETB:    { type: Number, default: 0 },

  status:    { type: String, enum: ['pending', 'collecting', 'completed', 'cancelled'], default: 'pending' },
  dueDate:   { type: Date, required: true },
  paidOutAt: { type: Date },

  contributions: [contributionSchema],

  // for rotation type — whose turn it is
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

equbRoundSchema.index({ equb: 1, roundNumber: 1 }, { unique: true });
equbRoundSchema.index({ status: 1, dueDate: 1 });

module.exports = mongoose.model('EqubRound', equbRoundSchema);
