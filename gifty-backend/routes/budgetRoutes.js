const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getOverallBudget,
  setOverallBudget,
  updateOverallBudget,
  getRecipientBudget,
  setRecipientBudget,
  updateRecipientBudget,
  getAllBudgets,
  getAvailableYears,
  getBudgetAnalytics
} = require('../controllers/budgetController');


// Overall budget routes
router.get('/overall/:year', protect, getOverallBudget);
router.post('/overall', protect, setOverallBudget);
router.put('/overall/:year', protect, updateOverallBudget);

// Individual recipient budget routes
router.get('/recipient/:recipientId/:year', protect, getRecipientBudget);
router.post('/recipient', protect, setRecipientBudget);
router.put('/recipient/:recipientId/:year', protect, updateRecipientBudget);


// Analytics route
router.get('/analytics/:year', protect, getBudgetAnalytics);

// Get all budgets for a year
router.get('/all/:year', protect, getAllBudgets);

// Get available years
router.get('/available-years', protect, getAvailableYears);

module.exports = router;
