const router = require('express').Router();
const ctrl   = require('../controllers/equbController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/open',          ctrl.listOpen);
router.get('/my',            ctrl.myEqubs);
router.get('/:id',           ctrl.getEqub);
router.post('/create',       ctrl.createEqub);
router.post('/:id/join',     ctrl.joinEqub);
router.post('/:id/contribute', ctrl.contribute);
router.post('/:id/leave',    ctrl.leaveEqub);

module.exports = router;
