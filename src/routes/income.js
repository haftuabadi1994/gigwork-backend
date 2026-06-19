const router = require('express').Router();
const ctrl = require('../controllers/incomeController');
const { protect } = require('../middleware/auth');
router.use(protect);
router.get('/summary', ctrl.getSummary);
module.exports = router;
