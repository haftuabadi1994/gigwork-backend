const { notify } = require('./notificationController');
const { processReferralBonuses } = require('./referralController');
const Task = require('../models/Task');
const TaskAssignment = require('../models/TaskAssignment');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { creditWallet } = require('../utils/wallet');

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

    res.json({ task: { ...task, myAssignment: assignment } });
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

// PATCH /api/tasks/:id/submit
exports.submitTask = async (req, res, next) => {
  try {
    const { submissionNote, submissionUrl } = req.body;
    const assignment = await TaskAssignment.findOne({
      user: req.user._id,
      task: req.params.id
    });
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
    if (['submitted', 'completed'].includes(assignment.status)) {
      return res.status(400).json({ error: 'Task already submitted.' });
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

    // Notify referrer if bonus paid
    if (assignment.user.referredBy) {
      const bonusPercent = Number(process.env.REFERRAL_BONUS_PERCENT) || 10;
      const bonus = Math.round(earnedETB * bonusPercent / 100);
      const prevCompleted = await TaskAssignment.countDocuments({ user: assignment.user._id, status: 'completed', _id: { $ne: assignment._id } });
      if (prevCompleted === 0 && bonus > 0) {
        await notify(assignment.user.referredBy, 'referral_earned', 'Referral bonus earned!',
          `${assignment.user.name} completed their first task. You earned ${bonus} ETB referral bonus!`, { bonus });
      }
    }

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
