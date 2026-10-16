#!/usr/bin/env node
// Money model (Phase 2) migration. Dry run by default: prints what would
// change and the budget drift report without writing anything.
//   node scripts/migrate-money-model.js             # dry run
//   node scripts/migrate-money-model.js --dry-run   # dry run
//   node scripts/migrate-money-model.js --apply     # back up, then migrate
// The server also applies it once automatically on its first boot.
require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/db');
const { runMoneyModelMigration } = require('../services/moneyMigration');

const parseArgs = (argv) => ({ apply: argv.includes('--apply') && !argv.includes('--dry-run') });

const main = async (argv) => {
  const { apply } = parseArgs(argv);
  await connectDB();
  try {
    const report = await runMoneyModelMigration({ apply, log: (line) => console.log(line) });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await disconnectDB();
  }
};

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { parseArgs, main };
