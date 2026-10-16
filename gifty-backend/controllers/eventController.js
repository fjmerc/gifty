const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Recipient = require('../models/Recipient');
const EventType = require('../models/EventType');
const Gift = require('../models/Gift');
const Notification = require('../models/Notification');
const { HttpError, findOwned, assertOwnedRefs, pickFields } = require('../utils/ownership');
const { isRecurring, syncSeries, removeSeries, adoptLegacyOccurrences } = require('../services/recurringEventService');

// What an occurrence of a series takes from it: any change made to these
// on the occurrence itself is the user's own edit
const occurrenceSignature = (event) => JSON.stringify([
    event.name,
    event.date && new Date(event.date).toISOString(),
    String(event.type),
    String(event.recipient),
    event.recurring?.frequency || 'None',
    Boolean(event.reminder?.isSet),
    event.reminder?.time ? new Date(event.reminder.time).toISOString() : null,
    event.reminder?.isSet ? event.reminder.method : null
]);

// Fields a client may set on its own events
const EVENT_FIELDS = ['name', 'date', 'type', 'recipient', 'recurring', 'reminder'];

const normalizeReminder = (reminder) => (reminder && reminder.isSet ? {
    isSet: true,
    time: reminder.time,
    method: reminder.method
} : { isSet: false, time: null, method: null });

// The recipient must be the caller's; the type must be a shared system type
// or a custom type the caller created.
const assertEventRefs = async (userId, { recipient, type }) => {
    await assertOwnedRefs(userId, [[Recipient, recipient, 'Recipient']]);
    if (type !== undefined && type !== null && type !== '') {
        const usable = mongoose.isValidObjectId(type) && await EventType.exists({
            _id: type,
            $or: [{ isCustom: { $ne: true } }, { createdBy: userId }]
        });
        if (!usable) throw new HttpError(404, 'Event type not found');
    }
};

// @desc Create a new event
// @route POST /api/events
// @access Private
exports.createEvent = asyncHandler(async (req, res) => {
    const fields = pickFields(req.body, EVENT_FIELDS);
    const { name, date, type, recipient } = fields;
    if (!name || !date || !type || !recipient) {
        res.status(400);
        throw new Error('Please include all required fields');
    }
    await assertEventRefs(req.user._id, fields);
    const event = await Event.create({
        ...fields,
        reminder: normalizeReminder(fields.reminder),
        user: req.user._id,
        // A new series has no pre-series occurrences to adopt
        ...(isRecurring(fields) ? { seriesLinked: true } : {})
    });
    if (isRecurring(event)) await syncSeries(event, { backfill: true });
    res.status(201).json(event);
});

// @desc Get events for a user, optionally filtered by recipient
// @route GET /api/events
// @access Private
exports.getEvents = asyncHandler(async (req, res) => {
    const { recipient } = req.query;
    let query = { user: req.user._id };
    if (recipient) {
        query.recipient = recipient;
    }
    const events = await Event.find(query)
        .populate('type', 'name _id')
        .populate('recipient', 'firstName lastName _id');
    res.json(events);
});

// @desc Update an event (only the provided fields change)
// @route PUT /api/events/:eventId
// @access Private
exports.updateEvent = asyncHandler(async (req, res) => {
    const event = await findOwned(Event, req.params.eventId, req.user._id, { label: 'Event' });
    const fields = pickFields(req.body, EVENT_FIELDS);
    // Only check references that actually change: auto-created birthday
    // events carry a hardcoded type id that may not exist as an EventType.
    const sameType = fields.type !== undefined && event.type && String(fields.type) === String(event.type);
    await assertEventRefs(req.user._id, {
        recipient: fields.recipient,
        type: sameType ? undefined : fields.type
    });

    if (fields.reminder !== undefined) {
        fields.reminder = normalizeReminder(fields.reminder);
    }
    // Link pre-series occurrences while the stored name and dates still match
    const wasRecurring = isRecurring(event);
    if (wasRecurring) await adoptLegacyOccurrences(event.toObject());
    const before = occurrenceSignature(event);
    const originalDate = event.date;
    event.set(fields);

    // An occurrence changed on its own leaves its series, and the series
    // skips its original day, so syncing never undoes the edit
    const series = event.series;
    const detach = series && occurrenceSignature(event) !== before;
    if (detach) event.series = undefined;

    const updatedEvent = await event.save();
    if (detach) {
        await Event.updateOne(
            { _id: series, user: req.user._id },
            { $addToSet: { 'recurring.exceptions': originalDate } }
        );
    }
    if (wasRecurring || isRecurring(updatedEvent)) await syncSeries(updatedEvent);
    res.json(updatedEvent);
});

// @desc Delete an event
// @route DELETE /api/events/:eventId
// @access Private
// Gifts require an event, so the event's gifts go with it. Purchased gifts
// are the record of money spent: those must be moved or deleted first.
exports.deleteEvent = asyncHandler(async (req, res) => {
    const event = await findOwned(Event, req.params.eventId, req.user._id, { label: 'Event' });
    const purchased = await Gift.countDocuments({ user: req.user._id, event: event._id, status: 'purchased' });
    if (purchased > 0) {
        const one = purchased === 1;
        throw new HttpError(409, `This event has ${purchased} purchased gift${one ? '' : 's'}, which ${one ? 'records' : 'record'} your spending. Move ${one ? 'it' : 'them'} to another event or delete ${one ? 'it' : 'them'} first.`);
    }
    await Gift.deleteMany({ user: req.user._id, event: event._id, status: { $ne: 'purchased' } });
    await Notification.deleteMany({ event: event._id });
    if (isRecurring(event)) await removeSeries(event);
    // A deleted occurrence stays deleted: the series skips that day from now on
    if (event.series) {
        await Event.updateOne(
            { _id: event.series, user: req.user._id },
            { $addToSet: { 'recurring.exceptions': event.date } }
        );
    }
    await event.deleteOne();
    res.status(204).json(); // No content to send back
});
