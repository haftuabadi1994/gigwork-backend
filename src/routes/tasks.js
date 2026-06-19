const router = require('express').Router();
const ctrl = require('../controllers/taskController');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect);

router.get('/', ctrl.listTasks);
router.get('/my', ctrl.myTasks);
router.get('/:id', ctrl.getTask);
router.post('/:id/accept', ctrl.acceptTask);
router.patch('/:id/submit', ctrl.submitTask);
router.post('/:id/complete', ctrl.completeTask);      // worker self-complete (demo mode)
router.post('/', adminOnly, ctrl.createTask);          // admin only

module.exports = router;
