const router = require('express').Router();
const ctrl = require('../controllers/referralController');
const { protect } = require('../middleware/auth');

router.get('/stats', protect, ctrl.getReferralStats);
router.get('/validate/:code', ctrl.validateCode);

module.exports = router;
