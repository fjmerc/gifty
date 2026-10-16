module.exports = {
  // Use the default preset for Create React App
  preset: 'react-scripts',
  
  // Test environment
  testEnvironment: 'jsdom',
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  
  // Setup globals before tests
  setupFiles: ['<rootDir>/src/setupGlobals.js'],
  
  // Module name mapping for CSS modules and assets
  moduleNameMapping: {
    // CSS Modules
    '\\.module\\.(css|scss|sass)$': 'identity-obj-proxy',
    // Regular CSS
    '\\.(css|scss|sass)$': 'identity-obj-proxy',
    // Static assets
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/src/__tests__/__mocks__/fileMock.js',
  },
  
  // Transform ignore patterns - allow ES modules in node_modules to be transformed
  transformIgnorePatterns: [
    'node_modules/(?!(axios|@fullcalendar|@fortawesome|lucide-react|react-icons|msw|@bundled-es-modules|statuses|is-what|@mswjs)/)',
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/index.js',
    '!src/reportWebVitals.js',
    '!src/**/*.test.{js,jsx}',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/setupTests.js',
    '!src/setupGlobals.js',
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  
  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Test match patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{test,spec}.{js,jsx}',
    '<rootDir>/src/**/*.{test,spec}.{js,jsx}',
  ],
  
  // Test patterns to ignore
  testPathIgnorePatterns: [
    '<rootDir>/src/__tests__/__mocks__/',
    '<rootDir>/src/__tests__/test-utils.js',
  ],
  
  // Module directories
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  
  // Global test timeout
  testTimeout: 10000,
  
  // Verbose output
  verbose: true,
};
