#!/usr/bin/env node

/**
 * Enhanced startup script for Gifty backend with improved logging
 * This script starts the server with additional logging options
 * and helps diagnose notification flooding issues
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Create a log file for this run
const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
const logFile = path.join(logsDir, `server-${timestamp}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

console.log(`Starting server with enhanced logging...`);
console.log(`Log file: ${logFile}`);

// Set environment variables for this run
const env = {
    ...process.env,
    LOG_LEVEL: 'debug', // Set to debug level for more verbose logging
    NODE_ENV: 'development'
};

// Start the server process
const serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    env,
    stdio: ['inherit', 'pipe', 'pipe']
});

// Log process output to console and file
serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    
    // Filter out excessive notification logs if needed
    if (output.includes('notification') && output.includes('stats')) {
        // Only log notification stats once per 10 seconds to avoid flooding
        const now = Date.now();
        if (!global.lastNotificationLog || now - global.lastNotificationLog > 10000) {
            global.lastNotificationLog = now;
            process.stdout.write(output);
            logStream.write(output);
        }
    } else {
        // Log everything else normally
        process.stdout.write(output);
        logStream.write(output);
    }
});

serverProcess.stderr.on('data', (data) => {
    const output = data.toString();
    process.stderr.write(output);
    logStream.write(`[ERROR] ${output}`);
});

// Handle server process exit
serverProcess.on('close', (code) => {
    const message = `Server process exited with code ${code}`;
    console.log(message);
    logStream.write(`${message}\n`);
    logStream.end();
});

// Handle script termination
process.on('SIGINT', () => {
    console.log('Stopping server...');
    serverProcess.kill('SIGINT');
});

console.log('Server started. Press Ctrl+C to stop.');
