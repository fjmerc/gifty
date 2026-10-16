const logger = require('../utils/logger');
const mongoose = require('mongoose');
const EventType = require('../models/EventType');
const Event = require('../models/Event');

// Custom type names are unique per creator; answer a clash in plain words,
// never with the driver's E11000 text
const isDuplicateKey = (error) => error && error.code === 11000;
const duplicateNameResponse = (res, name) =>
    res.status(409).json({ message: `You already have an event type named ${String(name).trim()}` });
// A rejected name says why
const validationResponse = (res, error) =>
    res.status(400).json({ message: Object.values(error.errors)[0].message });

// Create a new EventType
// Types created through the API are always the caller's own custom types;
// shared system types come only from the database seeder.
exports.createEventType = async (req, res) => {
    try {
        const { name, description } = req.body;

        const eventType = new EventType({
            name,
            description,
            isCustom: true,
            createdBy: req.user._id
        });

        await eventType.save();
        res.status(201).json(eventType);
    } catch (error) {
        if (isDuplicateKey(error)) return duplicateNameResponse(res, req.body.name);
        if (error.name === 'ValidationError') return validationResponse(res, error);
        logger.error('Event type request failed', { error: error.message });
        res.status(400).json({ message: 'Error creating event type' });
    }
};

// A custom type is visible (and modifiable) only by its creator
const isOwnCustomType = (eventType, userId) =>
    Boolean(eventType.createdBy) && eventType.createdBy.toString() === userId.toString();

// Retrieve all EventTypes - with option to filter by system or custom types
exports.getAllEventTypes = async (req, res) => {
    try {
        // Everyone sees the system types; custom types only for their creator
        const filter = {
            $or: [{ isCustom: { $ne: true } }, { createdBy: req.user._id }]
        };

        // Optional narrowing by type (userOnly=true is now implied for custom types)
        if (req.query.isCustom === 'true') {
            filter.isCustom = true;
        } else if (req.query.isCustom === 'false') {
            filter.isCustom = false;
        }

        const eventTypes = await EventType.find(filter);
        res.status(200).json(eventTypes);
    } catch (error) {
        logger.error('Event type request failed', { error: error.message });
        res.status(500).json({ message: 'Error fetching event types' });
    }
};

// Update an EventType
exports.updateEventType = async (req, res) => {
    try {
        const { eventTypeID } = req.params;
        const { name, description } = req.body;
        
        // Find the event type first
        const eventType = mongoose.isValidObjectId(eventTypeID)
            ? await EventType.findById(eventTypeID)
            : null;

        // Another user's custom type is reported exactly like a missing one
        if (!eventType || (eventType.isCustom && !isOwnCustomType(eventType, req.user._id))) {
            return res.status(404).json({ message: 'EventType not found' });
        }
        
        // Check if user can update this event type (system types can't be modified, custom types only by creator)
        if (!eventType.isCustom) {
            return res.status(403).json({ message: 'System event types cannot be modified' });
        }

        // Fields left out stay as they are; save() checks the name as create does
        if (name !== undefined) eventType.name = name;
        if (description !== undefined) eventType.description = description;
        await eventType.save();

        res.status(200).json(eventType);
    } catch (error) {
        if (isDuplicateKey(error)) return duplicateNameResponse(res, req.body.name);
        if (error.name === 'ValidationError') return validationResponse(res, error);
        logger.error('Event type request failed', { error: error.message });
        res.status(400).json({ message: 'Error updating event type' });
    }
};

// Delete an EventType
exports.deleteEventType = async (req, res) => {
    try {
        const { eventTypeID } = req.params;
        
        // Find the event type first
        const eventType = mongoose.isValidObjectId(eventTypeID)
            ? await EventType.findById(eventTypeID)
            : null;

        // Another user's custom type is reported exactly like a missing one
        if (!eventType || (eventType.isCustom && !isOwnCustomType(eventType, req.user._id))) {
            return res.status(404).json({ message: 'EventType not found' });
        }
        
        // Check if user can delete this event type (system types can't be deleted, custom types only by creator)
        if (!eventType.isCustom) {
            return res.status(403).json({ message: 'System event types cannot be deleted' });
        }

        // Block deletion while events still reference this type, otherwise those
        // events are orphaned and crash pages that read event.type.name.
        const referencingCount = await Event.countDocuments({ type: eventTypeID });
        if (referencingCount > 0) {
            return res.status(409).json({
                message: `Cannot delete event type: ${referencingCount} event(s) still use it.`
            });
        }

        // Delete the event type
        await EventType.findByIdAndDelete(eventTypeID);
        res.status(204).send();
    } catch (error) {
        logger.error('Event type request failed', { error: error.message });
        res.status(500).json({ message: 'Error deleting event type' });
    }
};
