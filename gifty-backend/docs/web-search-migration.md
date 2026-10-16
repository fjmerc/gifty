# Web Search Enhancement Migration Guide

This guide explains how to upgrade your existing Gifty installation to include the new web search enhancement feature for gift suggestions.

## Overview

The web search enhancement checks AI-generated suggestions against a Brave web search and keeps links to related pages it found (pages about the same kind of gift, not necessarily the product itself). Prices remain the AI's estimates; no price, availability or rating is taken from the web.

## Migration Steps

### 1. Update Environment Variables

Add the following to your `.env` file:

```
BRAVE_SEARCH_API_KEY=your_brave_search_api_key_here
```

**Note**: You can obtain a Brave Search API key from [Brave Search API Dashboard](https://api.search.brave.com/app/dashboard).

### 2. Update Files

1. Create the new web search service file:
   - Copy `services/webSearchAiService.js` from the repository

2. Update the gift controller:
   - The `giftController.js` has been updated to support the `webEnhanced` parameter

3. Update your `.env.example` file to include:
   ```
   BRAVE_SEARCH_API_KEY=your_brave_search_api_key_here
   ```

### 3. Update Dependencies

No new npm packages are required as the implementation uses the existing `axios` library.

### 4. Test the Implementation

Test the new functionality by making a request with the `webEnhanced` parameter:

```bash
curl -X POST http://localhost:5000/api/gifts/suggestions?webEnhanced=true \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientId": "RECIPIENT_ID",
    "eventId": "EVENT_ID"
  }'
```

### 5. Frontend Updates (Optional)

If you want to enable web-enhanced suggestions from your frontend:

1. Update your API calls to include the `webEnhanced` parameter
2. Show each gift's `webSources` (title, url, host; at most 3) and the `webSearchInfo` warning

Example:
```javascript
const response = await fetch('/api/gifts/suggestions?webEnhanced=true', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    recipientId: recipientId,
    eventId: eventId
  })
});
```

## Rollback Procedure

If you need to rollback:

1. Remove the `BRAVE_SEARCH_API_KEY` from your `.env` file
2. The system will automatically fallback to standard AI suggestions

## Troubleshooting

### Common Issues

1. **API Key Not Working**
   - Verify your Brave Search API key is valid
   - Check API key permissions in the Brave dashboard

2. **Web Search Not Activating**
   - Ensure the `webEnhanced` parameter is set to `true`
   - Check server logs for any error messages

3. **Performance Issues**
   - Web-enhanced suggestions may take longer to generate
   - Consider implementing caching for frequently searched items

### Logging

The web search service includes detailed logging. Check your server logs for:
- `[webSearchAiService]` entries for debugging
- Error messages if the Brave API fails

## New Features

After migration, you'll have access to:

1. **Related pages on the web**: up to 3 links per searched suggestion, only pages the search returned in that generation
2. **Honest status**: `webSearchInfo.searchPerformed` is true only when a search found something, with a warning otherwise

## Best Practices

1. Use web-enhanced mode selectively to manage API costs
2. Implement client-side caching for repeated searches
3. Monitor Brave API usage in your dashboard
4. Set up error alerts for API failures

## Support

If you encounter issues during migration:

1. Check the server logs for detailed error messages
2. Verify all environment variables are correctly set
3. Ensure your Brave Search API key has the necessary permissions

For additional help, please refer to the [API documentation](./gift-suggestions-api.md) or create an issue in the repository.
