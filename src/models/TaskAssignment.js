const mongoose = require('mongoose');

const taskAssignmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  status: {
    type: String,
    enum: ['accepted', 'in_progress', 'submitted', 'completed', 'rejected'],
    default: 'accepted'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  submissionNote: {
    type: String,
    maxlength: 1000
  },
  submissionUrl: {
    type: String
  },
  reviewNote: {
    type: String
  },
  earnedETB: {
    type: Number,
    default: 0
  },
  // Seconds of trailer video the worker has watched, reported by the
  // mobile app via PATCH /api/tasks/:id/view-progress. Used to enforce
  // Task.requiredViewSeconds before allowing submission.
  watchedSeconds: {
    type: Number,
    default: 0,
    min: 0
  },
  acceptedAt: {
    type: Date,
    default: Date.now
  },
  submittedAt: Date,
  completedAt: Date
}, {
  timestamps: true
});

// Prevent a user from accepting the same task twice
taskAssignmentSchema.index({ user: 1, task: 1 }, { unique: true });

module.exports = mongoose.model('TaskAssignment', taskAssignmentSchema);