const router = require('express').Router();
const ctrl = require('../controllers/teamController');
const { protect } = require('../middleware/auth');
router.use(protect);
router.get('/stats', ctrl.getTeamStats);
router.get('/leaderboard', ctrl.getLeaderboard);
module.exports = router;
