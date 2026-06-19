const router = require('express').Router();
const ctrl = require('../controllers/handbookController');
const { protect } = require('../middleware/auth');
router.use(protect);
router.get('/', ctrl.list);
module.exports = router;
