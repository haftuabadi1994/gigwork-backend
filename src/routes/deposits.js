const router = require('express').Router();
const ctrl = require('../controllers/depositController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(protect);

router.get('/methods', ctrl.getMethods);
router.get('/', ctrl.getMyDeposits);
router.post('/', upload.single('receipt'), ctrl.submitDeposit);

module.exports = router;
