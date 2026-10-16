// The first-run setup code the test environment accepts (see jest.setup.js):
// add it to a registration that may be the first account on an empty database
const TEST_SETUP_CODE = process.env.SETUP_CODE || 'TEST-SETUP-CODE-0000';

module.exports = { TEST_SETUP_CODE };
