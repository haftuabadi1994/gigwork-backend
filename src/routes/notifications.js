// notifications.js
const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');
router.use(protect);
router.get('/', ctrl.list);
router.patch('/read-all', ctrl.markAllRead);
router.patch('/:id/read', ctrl.markRead);
router.delete('/', ctrl.clearAll);
module.exports = router;
