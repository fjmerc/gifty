# Gifty Application Logging Guide

## Overview

This document describes the logging system implemented in the Gifty application.

## Logging Philosophy

- **Structured Logging**: All logs are structured in JSON format for better parsing and analysis
- **Contextual Information**: Every log includes request ID, instance ID, and relevant contextual info
- **Privacy Protection**: Sensitive data is automatically filtered from logs
- **Environment-aware**: Different log levels for different environments
- **Comprehensive Coverage**: Application lifecycle, requests, errors, and business events are logged

## Log Levels

- **ERROR**: System errors, crashes, and severe issues that need immediate attention
- **WARN**: Potential issues, deprecated feature usage, or unexpected conditions
- **INFO**: Normal application lifecycle events, API calls, and business events
- **DEBUG**: Detailed information for debugging (development only)

## Configuration

Logging configuration is controlled via environment variables:

```
LOG_LEVEL=debug|info|warn|error  # Default: info in production, debug otherwise
INSTANCE_ID=instance-name        # Used to identify this server instance
```

## Request Logging

Every HTTP request is automatically logged with:

- Unique request ID (also returned in X-Request-ID header)
- HTTP method and path
- Response status code and time
- User ID (if authenticated)
- Client IP address

## Error Logging

All errors include:

- Error message and stack trace
- Request context (if applicable)
- Error name and code
- Associated user (if applicable)

## Best Practices

1. **Always use the logger** instead of console.log/warn/error
2. **Include context** with every log message
3. **Choose the appropriate level** for your message
4. **Be concise but descriptive** in log messages
5. **Never log sensitive information** (passwords, tokens, etc.)

## Logging Code Examples

### Basic logging:

```javascript
const logger = require('../utils/logger');

// Simple info log
logger.info('User registered successfully', { userId: '123', email: 'user@example.com' });

// Error logging
try {
  // Some operation
} catch (error) {
  logger.error('Failed to process payment', { 
    orderId: 'ORD-123', 
    error: error.message, 
    stack: error.stack 
  });
}
```

### Request context logging:

```javascript
const logger = require('../utils/logger');

// In a controller/route handler
app.get('/api/resource', (req, res) => {
  // Get request context
  const context = logger.addRequestContext(req);
  
  // Log with context
  logger.info('Processing resource request', { 
    ...context,
    resourceId: req.params.id 
  });
  
  // Rest of the handler
});
```

## Log Storage and Rotation

Logs are stored in the `/logs` directory:

- `combined.log`: All logs
- `error.log`: Error logs only

Log files are automatically rotated when they reach 10MB, with a maximum of 5 files kept.
