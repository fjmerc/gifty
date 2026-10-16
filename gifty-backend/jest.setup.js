// jest.setup.js
// Set up global test environment configuration
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.test file
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

// Increase timeout for all tests
jest.setTimeout(60000);

// Mock console methods to reduce noise during testing
const originalConsoleError = console.error;
console.error = (...args) => {
  // Filter out specific mongoose deprecation warnings
  const ignoredMessages = [
    'DeprecationWarning: Mongoose',
    'buffering timed out after',
    'Operation `users.deleteMany()`',
  ];
  
  if (args.length > 0 && typeof args[0] === 'string' && 
      ignoredMessages.some(msg => args[0].includes(msg))) {
    return;
  }
  
  originalConsoleError(...args);
};

// First-run setup code for suites that register the first account on an
// empty database (services/setupCodeService honours it only under
// NODE_ENV=test). Send it as setupCode; tests/utils/setupCode.js has it.
process.env.SETUP_CODE = process.env.SETUP_CODE || 'TEST-SETUP-CODE-0000';

// Secrets the server generates into data/secrets.json at boot
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-0123456789abcdef0123456789';
