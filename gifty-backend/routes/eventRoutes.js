const express = require('express');
const {
    createEvent,
    getEvents,
    updateEvent,
    deleteEvent
} = require('../controllers/eventController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Route to create a new event
router.post('/', protect, createEvent);

// Route to retrieve all events for the authenticated user
router.get('/', protect, getEvents);

// Route to update an existing event
router.put('/:eventId', protect, updateEvent);

// Route to delete an event
router.delete('/:eventId', protect, deleteEvent);

module.exports = router;
