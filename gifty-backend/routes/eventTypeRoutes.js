const express = require('express');
const router = express.Router();
const eventTypeController = require('../controllers/eventTypeController');
const { protect } = require('../middleware/authMiddleware');

// POST new event type
router.post('/', protect, eventTypeController.createEventType);

// GET all event types
router.get('/', protect, eventTypeController.getAllEventTypes);

// PUT to update an existing event type
router.put('/:eventTypeID', protect, eventTypeController.updateEventType);

// DELETE to remove an event type
router.delete('/:eventTypeID', protect, eventTypeController.deleteEventType);

module.exports = router;