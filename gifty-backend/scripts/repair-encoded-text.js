#!/usr/bin/env node
// Repairs text stored HTML-encoded by the input filter removed in 2026-10
// ("O&#39;Brien" back to "O'Brien"). Dry run by default.
//   node scripts/repair-encoded-text.js             # dry run
//   node scripts/repair-encoded-text.js --apply     # back up, then repair
//   node scripts/repair-encoded-text.js --apply --force
//       # run again after restoring the backup of an interrupted run
// The server also applies it once automatically on its first boot. It refuses
// to run twice without --force: decoding twice would corrupt text.
require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/db');
const { runTextRepair } = require('../services/textRepairMigration');

const parseArgs = (argv) => {
  const apply = argv.includes('--apply') && !argv.includes('--dry-run');
  return { apply, force: apply && argv.includes('--force') };
};

const main = async (argv) => {
  const { apply, force } = parseArgs(argv);
  await connectDB();
  try {
    const report = await runTextRepair({ apply, force, log: (line) => console.log(line) });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await disconnectDB();
    // Applying clears cached responses; don't let the Redis client keep the process alive
    require('../config/redis').redisClient.disconnect();
  }
};

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, main };
