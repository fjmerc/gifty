# Multi-Source Gift Discovery System Deployment Instructions

## Overview

This document outlines the steps to deploy the enhanced Gifty application with the new Multi-Source Gift Discovery System.

## Prerequisites

1. Node.js (v14 or later)
2. MongoDB (v4.4 or later)
3. Brave Search API key
4. Redis (optional, for rate limiting)

## Deployment Steps

### 1. Update Dependencies

```bash
cd gifty-backend
npm install
```

### 2. Environment Configuration

Add the following environment variables to your `.env` file:

```env
# Discovery System Configuration
BRAVE_API_KEY=your_brave_api_key
DISCOVERY_INTERVAL=3600000
MAX_GIFTS_PER_DISCOVERY=1000
SIMILARITY_THRESHOLD=0.85

# Logging Configuration
LOG_LEVEL=info
```

### 3. Database Migration

No manual step: the GiftLibrary collection and its indexes are created when the
server starts (Mongoose builds the model's indexes). The library then fills
through gift discovery, which runs weekly when `BRAVE_SEARCH_API_KEY` is set.

### 4. Frontend Deployment

```bash
cd gifty-frontend
npm install
npm run build
```

### 5. Backend Deployment

```bash
cd gifty-backend
npm run start
```

For production, use a process manager like PM2:

```bash
pm2 start server.js --name gifty-backend
```

## Post-Deployment Verification

### 1. Check Discovery Scheduler

Verify the discovery scheduler is running:

```bash
curl http://localhost:5000/api/gift-library/discover/status
```

### 2. Test Hybrid Suggestions

On the Gifts page, choose **Hybrid Mode**, pick a recipient and an event, and select **Generate Suggestions** (this calls `POST /api/gifts/suggestions` with `hybrid: true`). Hybrid mode needs a gift library of more than the minimum size; until then it falls back to enhanced suggestions and says so.

### 3. Monitor the Library

Check the gift library's size and health (signed in):

```bash
curl http://localhost:5000/api/gift-library/system-health
```

## Monitoring and Maintenance

### 1. Log Files

Monitor logs at:
- Backend logs: `gifty-backend/logs/combined.log`
- Error logs: `gifty-backend/logs/error.log`

### 2. Database Maintenance

The system automatically:
- Runs discovery every hour
- Updates popularity scores daily
- Archives stale gifts after 90 days

### 3. Performance Monitoring

Use the analytics endpoint to monitor:
- Gift discovery rate
- User engagement metrics
- System health

## Troubleshooting

### Common Issues

1. **Discovery not running**: Check Brave API key and network connectivity
2. **High memory usage**: Adjust `MAX_GIFTS_PER_DISCOVERY`
3. **Rate limiting**: Increase rate limits or add Redis caching

### Error Recovery

The system includes automatic error recovery:
- Retries failed discoveries with exponential backoff
- Falls back to AI-only suggestions if discovery fails
- Logs all errors for debugging

## Rollback Procedure

If issues occur:

1. Stop the discovery scheduler in server.js
2. Restart the application

Users can pick another suggestion mode; Hybrid falls back to Enhanced AI
suggestions by itself while the gift library is too small.

## Support

For issues or questions:
1. Check logs for error messages
2. Review analytics for system health
3. Contact the development team

## Security Considerations

1. Secure the Brave API key
2. Monitor API usage for unusual patterns
3. Regularly update dependencies
4. Enable CORS restrictions in production
