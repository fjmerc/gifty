# Gift Suggestions API Documentation

## Overview

The Gift Suggestions API provides intelligent gift recommendations based on recipient preferences, relationship context, and event details. The system offers three levels of gift suggestion generation:

1. **Standard AI Suggestions**: Uses OpenAI's GPT model to generate gift suggestions
2. **Enhanced AI Suggestions**: Incorporates machine learning insights and feedback history
3. **Web-Enhanced Suggestions**: Combines AI generation with real-time web search data (New!)

## API Endpoints

### Generate Gift Suggestions

`POST /api/gifts/suggestions`

#### Request Body

```json
{
  "recipientId": "string",  // Required
  "eventId": "string",      // Required
  "enhanced": boolean,      // Optional: Use enhanced AI suggestions (default: false)
  "webEnhanced": boolean    // Optional: Use web-enhanced suggestions (default: false)
}
```

#### Query Parameters

As an alternative to the request body, you can use query parameters:

- `enhanced=true`: Enable enhanced AI suggestions
- `webEnhanced=true`: Enable web-enhanced suggestions with real-time search

#### Response

```json
[
  {
    "_id": "string",
    "name": "string",
    "description": "string",
    "category": "string",
    "tags": ["string"],
    "estimatedPrice": number,
    "priceRange": {
      "min": number,
      "max": number
    },
    "whereToBuy": ["string"],
    "relevanceScore": number,
    "status": "suggestion",
    "isAISuggested": true,
    
    // Additional fields for web-enhanced suggestions:
    "currentPrice": {
      "min": number,
      "max": number,
      "average": number
    },
    "availability": {
      "isAvailable": boolean,
      "confidence": number
    },
    "reviews": {
      "averageRating": number,
      "reviewCount": number
    },
    "trendingScore": number,
    "alternativeProducts": [
      {
        "name": "string",
        "source": "string"
      }
    ],
    "updatedAt": "datetime",
    "isWebDiscovered": boolean,
    "sourceUrl": "string"
  }
]
```

## Using Web-Enhanced Suggestions

The web-enhanced suggestions feature combines AI-generated gift ideas with real-time web search data to provide:

### Benefits

1. **Current Pricing**: Real-time price information from online retailers
2. **Availability**: Up-to-date stock and availability status
3. **Review Data**: Current ratings and review counts
4. **Trending Items**: Discover popular and seasonal products
5. **Alternative Products**: Find similar items if the original is unavailable
6. **Fresh Suggestions**: Overcome AI model limitations by discovering new products

### When to Use

- When AI suggestions become repetitive
- For niche interests or specialized products
- When real-time pricing is important
- For seasonal or trending items
- When stock availability is crucial

### Implementation Example

```javascript
// Frontend request example
const response = await fetch('/api/gifts/suggestions?webEnhanced=true', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    recipientId: '123',
    eventId: '456'
  })
});

const suggestions = await response.json();
```

## How It Works

1. **AI Generation**: First generates suggestions using the AI model
2. **Repetition Detection**: Checks if suggestions are becoming repetitive
3. **Web Enrichment**: Enhances each suggestion with web search data
4. **New Discovery**: If repetitive, discovers additional products through targeted searches
5. **Result Merging**: Combines AI suggestions with web-discovered items

## Configuration

To enable web-enhanced suggestions, add the following to your `.env` file:

```
BRAVE_SEARCH_API_KEY=your_brave_search_api_key_here
```

## Rate Limiting and Best Practices

- Web search is only triggered when requested or when repetition is detected
- Search results are rate-limited to avoid excessive API usage
- Consider caching search results for frequently requested categories
- Use web-enhanced mode selectively for best performance

## Error Handling

The API will gracefully fallback to standard AI suggestions if:
- Brave Search API key is not configured
- Web search API is unavailable
- Rate limits are exceeded

Error responses will include appropriate status codes and messages.

## Future Enhancements

Planned improvements include:
- Local search for store availability
- Price tracking and alerts
- Sentiment analysis of reviews
- Seasonal trend prediction
- Multi-marketplace comparison
