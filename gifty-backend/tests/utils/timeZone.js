// Node's date handling follows TZ only on the real process; Jest gives each
// test file a copy of process.env, so time zone tests set both. An unset TZ
// must be deleted, not assigned: `env.TZ = undefined` stores the string
// "undefined", which later test files inherit.
const realProcess = require('vm').runInThisContext('process');

const setTimeZone = (zone) => {
  [process.env, realProcess.env].forEach((env) => {
    if (zone === undefined) delete env.TZ;
    else env.TZ = zone;
  });
};

module.exports = { realProcess, setTimeZone };
