// Settings → Export data: a readable copy of a user's data for a spreadsheet.
// Every row of a type has the same columns, people, events and types appear
// by name, days are YYYY-MM-DD and prices carry their currency. An export is
// not a backup: GET /api/settings/backup is the file a restore takes.
const Gift = require('../models/Gift');
const Event = require('../models/Event');
const EventType = require('../models/EventType');
const Recipient = require('../models/Recipient');
const Tag = require('../models/Tags');
const { Budget, OverallBudget } = require('../models/Budget');
const { yearInTimeZone, getTimeZone } = require('../utils/dates');
const { budgetLimitCents, overallLimitCents } = require('./moneyService');

const { FALLBACK_CURRENCY } = require('../config/instanceDefaults');
const User = require('../models/User');
const EXPORT_TYPES = ['recipients', 'gifts', 'events', 'budgets'];

// Calendar days (event dates, birthdays) are stored as UTC midnight
const calendarDay = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');

// A purchase date is a moment; its day is the one in the instance time zone
const dayInTimeZone = (date) => {
    if (!date) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: getTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(date));
    const get = (type) => parts.find((p) => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
};

const list = (values) => (values || []).filter((v) => v !== null && v !== undefined && v !== '').join('; ');
const fullName = (recipient) => (recipient ? `${recipient.firstName} ${recipient.lastName}`.trim() : '');
const orEmpty = (value) => (value === null || value === undefined ? '' : value);
// A limit in cents as an amount; no limit is an empty cell
const amount = (cents) => (cents === null ? '' : cents / 100);

/**
 * The rows of each requested type, as objects with the same keys in the
 * same order for every row of a type
 * @param {ObjectId} userId - Whose data
 * @param {string[]} types - Any of recipients, gifts, events, budgets
 * @returns {Promise<Object>} e.g. { gifts: [{ Name, Recipient, ... }] }
 */
const buildExport = async (userId, types) => {
    const owned = { user: userId };
    const [recipients, events, overallBudgets, user] = await Promise.all([
        Recipient.find(owned).lean(),
        Event.find(owned).sort({ date: 1 }).lean(),
        OverallBudget.find(owned).lean(),
        User.findById(userId).select('preferences.currency').lean()
    ]);
    const recipientById = new Map(recipients.map((r) => [String(r._id), r]));
    const eventById = new Map(events.map((e) => [String(e._id), e]));
    const currencyOfYear = new Map(overallBudgets.map((b) => [b.year, b.currency]));
    // A year without an overall budget takes the latest year's currency,
    // else the account's own
    const latest = [...overallBudgets].sort((a, b) => b.year - a.year).find((b) => b.currency);
    const fallbackCurrency = latest ? latest.currency : (user?.preferences?.currency || FALLBACK_CURRENCY);
    const currencyFor = (year) => currencyOfYear.get(year) || fallbackCurrency;

    const result = {};
    for (const type of types) {
        if (type === 'recipients') {
            const tagIds = recipients.flatMap((r) => r.tags || []);
            const tags = await Tag.find({ _id: { $in: tagIds } }).lean();
            const tagName = new Map(tags.map((t) => [String(t._id), t.name]));
            result.recipients = recipients.filter((r) => !r.isSystemAccount).map((r) => ({
                'First name': r.firstName,
                'Last name': r.lastName,
                Relation: orEmpty(r.relation),
                Relationship: orEmpty(r.relationship),
                Birthday: calendarDay(r.birthdate),
                Interests: list(r.interests),
                Hobbies: list(r.hobbies),
                Tags: list((r.tags || []).map((id) => tagName.get(String(id)))),
                Address: list([r.address?.street, r.address?.city, r.address?.state, r.address?.zipCode, r.address?.country]),
                Archived: r.archived ? 'yes' : 'no'
            }));
        } else if (type === 'gifts') {
            const gifts = await Gift.find(owned).sort({ createdAt: 1 }).lean();
            result.gifts = gifts.map((g) => {
                const event = eventById.get(String(g.event));
                // The year a gift's money belongs to: when it was bought, else its event's
                const year = g.purchaseDate ? yearInTimeZone(g.purchaseDate) : (event ? new Date(event.date).getUTCFullYear() : null);
                return {
                    Name: g.name,
                    Recipient: fullName(recipientById.get(String(g.recipient))),
                    Event: event ? event.name : '',
                    'Event date': event ? calendarDay(event.date) : '',
                    Status: orEmpty(g.status),
                    Price: orEmpty(g.price),
                    Currency: year ? currencyFor(year) : fallbackCurrency,
                    'Purchase date': g.status === 'purchased' ? dayInTimeZone(g.purchaseDate) : '',
                    Category: orEmpty(g.category),
                    Tags: list(g.tags),
                    'Where to buy': list(g.whereToBuy),
                    Description: orEmpty(g.description),
                    Favorite: g.favorite ? 'yes' : 'no',
                    'AI suggested': g.isAISuggested ? 'yes' : 'no'
                };
            });
        } else if (type === 'events') {
            const typeIds = [...new Set(events.map((e) => String(e.type)))];
            const eventTypes = await EventType.find({ _id: { $in: typeIds } }).lean();
            const typeName = new Map(eventTypes.map((t) => [String(t._id), t.name]));
            result.events = events.map((e) => ({
                Name: e.name,
                Date: calendarDay(e.date),
                Type: typeName.get(String(e.type)) || '',
                Recipient: fullName(recipientById.get(String(e.recipient))),
                Repeats: e.recurring?.frequency && e.recurring.frequency !== 'None' ? e.recurring.frequency : '',
                Reminder: e.reminder?.isSet && e.reminder.time ? `${dayInTimeZone(e.reminder.time)} (${e.reminder.method})` : '',
                Holiday: e.isSystemGenerated ? 'yes' : 'no'
            }));
        } else if (type === 'budgets') {
            const budgets = await Budget.find(owned).sort({ year: 1 }).lean();
            const overallOfYear = new Map(overallBudgets.map((b) => [b.year, b]));
            const rows = [...overallBudgets].sort((a, b) => a.year - b.year).map((b) => ({
                Recipient: '(whole year)',
                Year: b.year,
                Limit: amount(overallLimitCents(b)),
                Percentage: '',
                Currency: b.currency || fallbackCurrency
            }));
            // A percentage budget's limit is its share of the year's budget
            result.budgets = rows.concat(budgets.map((b) => ({
                Recipient: fullName(recipientById.get(String(b.recipient))),
                Year: b.year,
                Limit: amount(budgetLimitCents(b, overallOfYear.get(b.year))),
                Percentage: b.allocationType === 'percentage' ? orEmpty(b.percentageAllocation) : '',
                Currency: currencyFor(b.year)
            })));
        }
    }
    return result;
};

// The columns of a type, so an empty section still has its header
const COLUMNS = {
    recipients: ['First name', 'Last name', 'Relation', 'Relationship', 'Birthday', 'Interests', 'Hobbies', 'Tags', 'Address', 'Archived'],
    gifts: ['Name', 'Recipient', 'Event', 'Event date', 'Status', 'Price', 'Currency', 'Purchase date', 'Category', 'Tags', 'Where to buy', 'Description', 'Favorite', 'AI suggested'],
    events: ['Name', 'Date', 'Type', 'Recipient', 'Repeats', 'Reminder', 'Holiday'],
    budgets: ['Recipient', 'Year', 'Limit', 'Percentage', 'Currency']
};

// One CSV cell (RFC 4180). Text a spreadsheet would run as a formula gets a
// leading apostrophe.
const csvCell = (value) => {
    if (typeof value === 'number') return String(value);
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvTable = (type, rows) => {
    const lines = [COLUMNS[type].map(csvCell).join(',')];
    rows.forEach((row) => lines.push(COLUMNS[type].map((column) => csvCell(row[column])).join(',')));
    return lines.join('\r\n');
};

/**
 * One CSV file with a titled section per type, starting with a byte order
 * mark so Excel opens it as UTF-8
 * @param {Object} data - From buildExport
 * @returns {string}
 */
const toCsv = (data) => '﻿' + Object.entries(data)
    .map(([type, rows]) => `${type.toUpperCase()}\r\n${csvTable(type, rows)}\r\n`)
    .join('\r\n');

/**
 * The CSV of one type alone (for the ZIP export)
 * @param {string} type
 * @param {Object[]} rows
 * @returns {string}
 */
const tableToCsv = (type, rows) => `﻿${csvTable(type, rows)}\r\n`;

module.exports = { buildExport, toCsv, tableToCsv, EXPORT_TYPES };
