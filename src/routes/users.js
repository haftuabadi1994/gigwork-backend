const router = require('express').Router();
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect);

// GET /api/users/leaderboard
router.get('/leaderboard', async (req, res, next) => {
  try {
    const users = await User.find({ isActive: true })
      .select('name tasksCompleted totalEarnedETB referralCount')
      .sort({ tasksCompleted: -1 })
      .limit(20);
    res.json({ leaderboard: users });
  } catch (err) {
    next(err);
  }
});

// GET /api/users — admin list all users
router.get('/', adminOnly, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const users = await User.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await User.countDocuments();
    res.json({ users: users.map(u => u.toPublicJSON()), total });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
