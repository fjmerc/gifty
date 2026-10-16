const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { listModels } = require('../controllers/aiController');

router.get('/models', protect, listModels);

module.exports = router;
