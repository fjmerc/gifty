// Runs once in the parent process before Jest workers start; workers inherit
// the environment, so every frontend test runs in Pacific time (UTC-8/-7).
module.exports = async () => {
  process.env.TZ = 'America/Los_Angeles';
};
