const router = require('express').Router();
const ctrl = require('../controllers/walletController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/', ctrl.getWallet);
router.get('/transactions', ctrl.getTransactions);
router.get('/withdrawals', ctrl.getWithdrawals);
router.post('/withdraw', ctrl.requestWithdrawal);

module.exports = router;
