const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { UPLOADS_DIR } = require('../config/runtime');
const logger = require('./logger');

// Names imageUpload generates: <timestamp>-<32 hex>.<ext> (or ...0.bin)
const GENERATED_NAME = /^\d+-[0-9a-f]{32}0?\.[a-z]+$/;

// Delete a replaced photo given its public path ('/uploads/<file>'). Stored
// paths can come from a restored backup, so a file is only removed when the
// server generated its name and no user or recipient still points at it.
// A file that is already gone is not an error.
const removeUnreferencedUpload = async (publicPath) => {
  if (typeof publicPath !== 'string' || !publicPath.startsWith('/uploads/')) return;
  const filename = publicPath.slice('/uploads/'.length);
  if (!GENERATED_NAME.test(filename)) return;

  const referencedBy = (name) => mongoose.models[name]?.exists({ profilePicture: publicPath });
  if (await referencedBy('User') || await referencedBy('Recipient')) return;

  try {
    await fs.unlink(path.join(UPLOADS_DIR, filename));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn(`Could not remove upload ${filename}: ${error.message}`);
    }
  }
};

module.exports = { removeUnreferencedUpload };
