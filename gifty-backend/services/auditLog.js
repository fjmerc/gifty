// Admin actions on accounts and the instance (1b), in their own collection:
// the legacy `auditlogs` collection has an unknown older shape
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const auditCollection = () => mongoose.connection.db.collection('auditevents');

/**
 * Record one admin action. Never throws: the action itself already happened.
 * @param {string} action e.g. 'role.changed', 'account.deactivated'
 * @param {{actor?: any, target?: any, details?: Object}} [info]
 */
const recordAudit = async (action, { actor = null, target = null, details = {} } = {}) => {
  try {
    await auditCollection().insertOne({ action, actor, target, details, at: new Date() });
  } catch (error) {
    logger.error(`Audit event ${action} not recorded: ${error.message}`);
  }
};

module.exports = { recordAudit, auditCollection };
