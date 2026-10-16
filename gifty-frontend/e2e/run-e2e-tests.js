#!/usr/bin/env node

/**
 * E2E Test Runner Script
 * 
 * This script provides a convenient way to run E2E tests with different configurations
 * Usage: node e2e/run-e2e-tests.js [options]
 */

const { exec } = require('child_process');
const path = require('path');

// Configuration
const config = {
  baseCommand: 'npx playwright test',
  defaultProject: 'chromium',
  reportDir: 'playwright-report',
  
  testSuites: {
    'setup': 'e2e/tests/00-setup-verification.spec.js',
    'auth': 'e2e/tests/01-authentication.spec.js', 
    'gifts': 'e2e/tests/02-gift-management.spec.js',
    'performance': 'e2e/tests/03-performance-accessibility.spec.js',
    'basic': 'e2e/tests/playwright-basic.spec.js'
  },
  
  projects: ['chromium', 'firefox', 'webkit', 'Mobile Chrome', 'Mobile Safari']
};

function printUsage() {
  console.log(`
🎭 Gifty E2E Test Runner

Usage: node e2e/run-e2e-tests.js [options]

Options:
  --help, -h          Show this help message
  --suite <name>      Run specific test suite (${Object.keys(config.testSuites).join(', ')})
  --project <name>    Run on specific browser (${config.projects.join(', ')})
  --headed           Run tests in headed mode (visible browser)
  --ui               Open Playwright test UI
  --debug            Run tests in debug mode
  --reporter <type>   Use specific reporter (line, dot, html, json)
  --all              Run all test suites

Examples:
  node e2e/run-e2e-tests.js --suite setup
  node e2e/run-e2e-tests.js --project chromium --headed
  node e2e/run-e2e-tests.js --ui
  node e2e/run-e2e-tests.js --all --reporter line
  node e2e/run-e2e-tests.js --suite auth --debug
`);
}

function buildCommand(options) {
  let cmd = config.baseCommand;
  
  // Add test file
  if (options.suite && config.testSuites[options.suite]) {
    cmd += ` ${config.testSuites[options.suite]}`;
  } else if (options.all) {
    // Run all test suites
    cmd += ` ${Object.values(config.testSuites).filter(suite => !suite.includes('basic')).join(' ')}`;
  }
  
  // Add project filter
  if (options.project) {
    cmd += ` --project="${options.project}"`;
  }
  
  // Add mode options
  if (options.headed) {
    cmd += ' --headed';
  }
  
  if (options.ui) {
    cmd = 'npx playwright test --ui';
    return cmd; // UI mode doesn't need other options
  }
  
  if (options.debug) {
    cmd += ' --debug';
  }
  
  // Add reporter
  if (options.reporter) {
    cmd += ` --reporter=${options.reporter}`;
  } else if (!options.debug && !options.ui) {
    cmd += ' --reporter=line';
  }
  
  return cmd;
}

function runCommand(cmd) {
  console.log(`🚀 Running: ${cmd}\n`);
  
  const child = exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Test execution failed: ${error.message}`);
      return;
    }
    
    console.log('\n✅ Test execution completed');
    
    if (stderr) {
      console.log('⚠️  Warnings:', stderr);
    }
  });
  
  child.stdout.on('data', (data) => {
    process.stdout.write(data);
  });
  
  child.stderr.on('data', (data) => {
    process.stderr.write(data);
  });
}

function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--help':
      case '-h':
        printUsage();
        return;
        
      case '--suite':
        options.suite = args[++i];
        break;
        
      case '--project':
        options.project = args[++i];
        break;
        
      case '--headed':
        options.headed = true;
        break;
        
      case '--ui':
        options.ui = true;
        break;
        
      case '--debug':
        options.debug = true;
        break;
        
      case '--reporter':
        options.reporter = args[++i];
        break;
        
      case '--all':
        options.all = true;
        break;
        
      default:
        console.log(`⚠️  Unknown option: ${arg}`);
        printUsage();
        return;
    }
  }
  
  // Validate options
  if (options.suite && !config.testSuites[options.suite]) {
    console.error(`❌ Invalid test suite: ${options.suite}`);
    console.log(`Available suites: ${Object.keys(config.testSuites).join(', ')}`);
    return;
  }
  
  if (options.project && !config.projects.includes(options.project)) {
    console.error(`❌ Invalid project: ${options.project}`);
    console.log(`Available projects: ${config.projects.join(', ')}`);
    return;
  }
  
  // Build and run command
  const command = buildCommand(options);
  runCommand(command);
}

// Quick test functions for specific scenarios
function quickTests() {
  console.log(`
🎯 Quick Test Commands:

1. Infrastructure Check:
   node e2e/run-e2e-tests.js --suite setup --project chromium

2. Authentication Flow:
   node e2e/run-e2e-tests.js --suite auth --project chromium --headed

3. Gift Management:
   node e2e/run-e2e-tests.js --suite gifts --project chromium

4. Performance & Accessibility:
   node e2e/run-e2e-tests.js --suite performance --project chromium

5. All Critical Tests:
   node e2e/run-e2e-tests.js --all --reporter html

6. Debug Mode:
   node e2e/run-e2e-tests.js --suite auth --debug

7. Test UI:
   node e2e/run-e2e-tests.js --ui
`);
}

// Check if script is run directly
if (require.main === module) {
  if (args.includes('--quick')) {
    quickTests();
  } else {
    main();
  }
}

module.exports = { buildCommand, config };