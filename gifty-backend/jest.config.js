module.exports = {
  // Setup file
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Default timeout for tests (in milliseconds)
  testTimeout: 60000, // Increase to 60 seconds
  // This helps with the timeout errors we're seeing
  testRunner: 'jest-circus/runner',
  verbose: true,

  // Prevent parallel execution to avoid race conditions
  maxWorkers: 1,

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'html', 'lcov', 'clover'],
  collectCoverageFrom: [
    'models/**/*.js',
    'controllers/**/*.js',
    'middleware/**/*.js',
    'routes/**/*.js',
    'services/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**',
    '!**/vendor/**',
    '!**/__tests__/**'
  ],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
  },

  // Test environment
  testEnvironment: 'node',
  
  // Handle open handles more gracefully
  detectOpenHandles: true,
  forceExit: false, // Set to true if database cleanup still doesn't work
  
  // Mocks
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  }
};
