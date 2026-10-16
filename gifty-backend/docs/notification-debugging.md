# Notification System Debugging Guide

This document provides guidance on debugging notification flooding issues in the Gifty application.

## Recent Changes

We've made several improvements to address notification flooding issues:

1. **Enhanced Backend Logging**:
   - Added detailed logging with request IDs for better traceability
   - Improved error handling and logging in notification-related endpoints
   - Added filtering for notification logs to reduce console noise

2. **Frontend Optimizations**:
   - Reduced polling frequency in the Notifications component
   - Added throttling to prevent excessive API calls
   - Added console logging to track notification fetches

3. **Notification Context Improvements**:
   - Reduced polling intervals from 30 seconds to 2 minutes
   - Added throttling to prevent rapid successive API calls
   - Improved logging to track notification polling

## Running with Enhanced Logging

To run the backend with enhanced logging for debugging notification issues:

```bash
cd gifty-backend
./run-with-logging.js
```

This script:
- Sets the log level to debug
- Creates a timestamped log file in the logs directory
- Filters excessive notification logs to prevent console flooding
- Captures both stdout and stderr for comprehensive logging

## Checking Logs

The logs are stored in the following locations:

- **General Application Logs**: `gifty-backend/logs/app.log`
- **Error Logs**: `gifty-backend/logs/error.log`
- **Notification-specific Logs**: `gifty-backend/logs/notifications.log`
- **Run-specific Logs**: `gifty-backend/logs/server-[timestamp].log`

You can use the following commands to monitor logs in real-time:

```bash
# Monitor notification logs
tail -f gifty-backend/logs/notifications.log

# Monitor error logs
tail -f gifty-backend/logs/error.log

# Monitor the current run log
tail -f gifty-backend/logs/server-*.log | sort -r | head -n 1
```

## Common Issues and Solutions

### Infinite Polling Loop

**Symptoms**:
- Console flooded with notification-related messages
- High CPU usage
- Slow application performance

**Potential Causes**:
1. Frontend components re-rendering too frequently, triggering new API calls
2. Multiple notification polling intervals running simultaneously
3. API responses triggering state updates that cause additional API calls

**Solutions**:
1. Check browser console for excessive API calls
2. Verify that polling intervals are being cleared properly on component unmount
3. Use the throttling mechanisms we've added to limit API call frequency

### Database Query Performance

If notification queries are slow, they might be blocking other operations. Check:

1. MongoDB indexes on the Notification collection
2. Query patterns in the notification controller
3. Database connection pool settings

## Monitoring Tools

For ongoing monitoring, consider:

1. Adding application performance monitoring (APM) tools
2. Setting up alerts for excessive API calls
3. Implementing rate limiting at the API gateway level

## Reverting Changes

If the changes don't resolve the issue, you can revert to the previous version:

```bash
git checkout HEAD~1 -- gifty-backend/services/notificationService.js
git checkout HEAD~1 -- gifty-frontend/src/pages/js/Notifications.js
git checkout HEAD~1 -- gifty-frontend/src/NotificationContext.js
```

## Contact

If you continue to experience issues, please contact the development team with:
1. The specific logs showing the problem
2. Steps to reproduce the issue
3. Browser console output
