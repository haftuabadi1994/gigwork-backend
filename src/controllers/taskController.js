const { notify } = require('./notificationController');
const { processReferralBonuses } = require('./referralController');
const Task = require('../models/Task');
const TaskAssignment = require('../models/TaskAssignment');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { creditWallet } = require('../utils/wallet');

// Default minimum view time (seconds) per platform, used when a task doesn't
// set its own requiredViewSeconds. Admin can override per task.
const PLATFORM_DEFAULT_VIEW_SECONDS = {
  youtube:   30,
  tiktok:    15,
  instagram: 15,
  facebook:  20,
  other:     0
};

// Resolve the effective required view time for a task.
function getRequiredViewSeconds(task) {
  if (!task.trailerVideoUrl) return 0; // no trailer => nothing to enforce
  if (task.requiredViewSeconds !== null && task.requiredViewSeconds !== undefined) {
    return task.requiredViewSeconds;
  }
  return PLATFORM_DEFAULT_VIEW_SECONDS[task.trailerPlatform] ?? 0;
}

// GET /api/tasks — list available tasks
exports.listTasks = async (req, res, next) => {
  try {
    const { category, page = 1, limit = 20 } = req.query;
    const query = {
      isActive: true,
      expiresAt: { $gt: new Date() },
      $expr: { $lt: ['$filledSlots', '$totalSlots'] }
    };
    if (category) query.category = category;

    const tasks = await Task.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    // Attach assignment status for logged-in user
    const taskIds = tasks.map(t => t._id);
    const assignments = await TaskAssignment.find({
      user: req.user._id,
      task: { $in: taskIds }
    }).lean();

    const assignmentMap = {};
    assignments.forEach(a => { assignmentMap[a.task.toString()] = a; });

    const enriched = tasks.map(t => ({
      ...t,
      requiredViewSeconds: getRequiredViewSeconds(t),
      myAssignment: assignmentMap[t._id.toString()] || null
    }));

    const total = await Task.countDocuments(query);
    res.json({ tasks: enriched, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

// GET /api/tasks/:id — single task detail
exports.getTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id).lean();
    if (!task) return res.status(404).json({ error: 'Task not found.' });

    const assignment = await TaskAssignment.findOne({
      user: req.user._id,
      task: task._id
    }).lean();

    res.json({
      task: {
        ...task,
        requiredViewSeconds: getRequiredViewSeconds(task),
        myAssignment: assignment
      }
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/tasks/:id/accept
exports.acceptTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task || !task.isActive) {
      return res.status(404).json({ error: 'Task not available.' });
    }
    if (task.filledSlots >= task.totalSlots) {
      return res.status(400).json({ error: 'No spots left for this task.' });
    }
    if (new Date() > task.expiresAt) {
      return res.status(400).json({ error: 'This task has expired.' });
    }

    const existing = await TaskAssignment.findOne({ user: req.user._id, task: task._id });
    if (existing) {
      return res.status(400).json({ error: 'You already accepted this task.' });
    }

    const assignment = await TaskAssignment.create({
      user: req.user._id,
      task: task._id,
      status: 'in_progress',
      progress: 10
    });

    task.filledSlots += 1;
    await task.save();

    await notify(req.user._id, 'task_assigned', 'Task accepted!',
      `You accepted: "${task.title}". Complete it to earn ${task.earningETB} ETB.`, { taskId: task._id });

    res.status(201).json({ message: 'Task accepted!', assignment });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/tasks/:id/view-progress
// Mobile app calls this periodically (or on completion) to report watch time.
// Stored on the assignment so submitTask can verify it server-side.
exports.reportViewProgress = async (req, res, next) => {
  try {
    const { watchedSeconds } = req.body;
    if (typeof watchedSeconds !== 'number' || watchedSeconds < 0) {
      return res.status(400).json({ error: 'watchedSeconds must be a non-negative number.' });
    }

    const assignment = await TaskAssignment.findOne({
      user: req.user._id,
      task: req.params.id
    });
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

    // Only ever increase — never let a client report less than what we already have.
    assignment.watchedSeconds = Math.max(assignment.watchedSeconds || 0, watchedSeconds);
    await assignment.save();

    res.json({ watchedSeconds: assignment.watchedSeconds });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/tasks/:id/submit
exports.submitTask = async (req, res, next) => {
  try {
    const { submissionNote, submissionUrl } = req.body;
    const task = await Task.findById(req.params.id).lean();
    if (!task) return res.status(404).json({ error: 'Task not found.' });

    const assignment = await TaskAssignment.findOne({
      user: req.user._id,
      task: req.params.id
    });
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
    if (['submitted', 'completed'].includes(assignment.status)) {
      return res.status(400).json({ error: 'Task already submitted.' });
    }

    // Enforce minimum view time server-side, not just in the UI.
    const requiredSeconds = getRequiredViewSeconds(task);
    const watchedSeconds = assignment.watchedSeconds || 0;
    if (requiredSeconds > 0 && watchedSeconds < requiredSeconds) {
      return res.status(400).json({
        error: `Please watch at least ${requiredSeconds}s before submitting. You've watched ${watchedSeconds}s.`,
        requiredViewSeconds: requiredSeconds,
        watchedSeconds
      });
    }

    assignment.status = 'submitted';
    assignment.progress = 80;
    assignment.submissionNote = submissionNote;
    assignment.submissionUrl = submissionUrl;
    assignment.submittedAt = new Date();
    await assignment.save();

    res.json({ message: 'Task submitted for review!', assignment });
  } catch (err) {
    next(err);
  }
};

// POST /api/tasks/:id/complete  (admin or auto-complete for demo)
exports.completeTask = async (req, res, next) => {
  try {
    const assignment = await TaskAssignment.findOne({
      user: req.params.userId || req.user._id,
      task: req.params.id
    }).populate('task').populate('user');

    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
    if (assignment.status === 'completed') {
      return res.status(400).json({ error: 'Task already completed.' });
    }

    const earnedETB = assignment.task.earningETB;
    assignment.status = 'completed';
    assignment.progress = 100;
    assignment.earnedETB = earnedETB;
    assignment.completedAt = new Date();
    await assignment.save();

    // Credit worker wallet
    await creditWallet({
      userId: assignment.user._id,
      amountETB: earnedETB,
      type: 'task_earning',
      description: `Completed: ${assignment.task.title}`,
      reference: assignment.task._id,
      referenceModel: 'Task'
    });

    // Process multi-tier referral bonuses (Tier A + Tier B)
    await processReferralBonuses({
      workerId: assignment.user._id,
      earnedETB,
      taskTitle: assignment.task.title
    });

    // Update user stats
    await User.findByIdAndUpdate(assignment.user._id, {
      $inc: { tasksCompleted: 1 }
    });

    // Notify worker
    await notify(assignment.user._id, 'task_completed', 'Task completed — payment sent!',
      `"${assignment.task.title}" approved. ${earnedETB} ETB credited to your income wallet.`, { taskId: assignment.task._id, earnedETB });

    res.json({ message: 'Task completed and payment credited!', earnedETB });
  } catch (err) {
    next(err);
  }
};

// GET /api/tasks/my — current user's assigned tasks
exports.myTasks = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { user: req.user._id };
    if (status) query.status = status;

    const assignments = await TaskAssignment.find(query)
      .populate('task')
      .sort({ createdAt: -1 });

    res.json({ assignments });
  } catch (err) {
    next(err);
  }
};

// POST /api/tasks — admin create task
exports.createTask = async (req, res, next) => {
  try {
    const task = await Task.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ message: 'Task created', task });
  } catch (err) {
    next(err);
  }
};