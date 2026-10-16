# Gifty Multi-Source Discovery API Documentation

## Overview

This document describes the API endpoints for the Multi-Source Gift Discovery System.

## Base URL

```
http://localhost:5000/api
```

## Authentication

All endpoints require Bearer token authentication:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

## Gift Library Endpoints

### Explore Gifts

Browse the gift library with filtering and pagination.

```
GET /gift-library/explore
```

**Query Parameters:**
- `categories` (string, comma-separated) - Filter by categories
- `minPrice` (number) - Minimum price filter
- `maxPrice` (number) - Maximum price filter
- `tags` (string, comma-separated) - Filter by tags
- `sort` (string) - Sort by: `popularity`, `price_asc`, `price_desc`, `newest`
- `page` (number) - Page number (default: 1)
- `limit` (number) - Items per page (default: 20)
- `search` (string) - Search query

**Response:**
```json
{
  "gifts": [
    {
      "_id": "123",
      "name": "Wireless Earbuds",
      "description": "High-quality wireless earbuds",
      "priceRange": { "min": 50, "max": 150 },
      "categories": ["electronics", "audio"],
      "popularityScore": 85,
      "discoveryDate": "2024-02-15T10:00:00Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 200,
    "itemsPerPage": 20
  }
}
```

### Get Categories

Get all available gift categories with counts.

```
GET /gift-library/categories
```

**Response:**
```json
{
  "categories": [
    { "category": "electronics", "count": 150 },
    { "category": "books", "count": 120 }
  ]
}
```

### Submit Feedback

Submit feedback on gift suggestions.

```
POST /gift-library/feedback
```

**Request Body:**
```json
{
  "giftId": "gift_id",
  "action": "liked",
  "feedback": "This was perfect!"
}
```

**Valid Actions:**
- `liked` - Positive feedback
- `purchased` - Gift was purchased
- `disliked` - Negative feedback
- `ignored` - User ignored suggestion

### Get Trending Gifts

Get trending gifts based on popularity.

```
GET /gift-library/trending
```

**Query Parameters:**
- `limit` (number) - Number of results (default: 10)
- `category` (string) - Filter by category
- `timeframe` (string) - Time period: `24h`, `7d`, `30d`

### Discovery System Status

Get status of the discovery system.

```
GET /gift-library/discover/status
```

**Response:**
```json
{
  "systemHealth": {
    "isHealthy": true,
    "totalGifts": 5000,
    "recentGifts": 100,
    "lastDiscovery": "2024-02-15T10:00:00Z"
  },
  "recentDiscoveries": [...],
  "stats": {
    "totalGifts": 5000,
    "avgPopularity": 75.5,
    "categories": ["electronics", "books"]
  }
}
```

### Trigger Discovery (Admin)

Manually trigger gift discovery process.

```
POST /gift-library/discover/trigger
```

**Response:**
```json
{
  "message": "Discovery process started in background"
}
```

## Analytics Endpoints

### Discovery Metrics

Get gift discovery metrics.

```
GET /analytics/discovery
```

**Query Parameters:**
- `timeframe` (string) - Time period: `24h`, `7d`, `30d`

### Engagement Metrics

Get user engagement metrics.

```
GET /analytics/engagement
```

### Hybrid Suggestion Metrics

Get performance metrics for hybrid suggestions.

```
GET /analytics/hybrid
```

### Analytics Report

Generate comprehensive analytics report.

```
GET /analytics/report
```

**Response:**
```json
{
  "timeframe": "30d",
  "generatedAt": "2024-02-15T10:00:00Z",
  "discovery": {
    "totalGifts": 5000,
    "recentDiscoveries": 500,
    "categoryDistribution": [...],
    "priceRangeDistribution": [...]
  },
  "engagement": {
    "totalFeedbacks": 1000,
    "feedbackDistribution": [...],
    "purchaseRate": 0.15
  },
  "hybridSuggestions": {
    "sourceDistribution": [...],
    "suggestionAcceptanceRate": 0.65,
    "averageRelevanceScore": 85
  },
  "summary": {
    "diversityScore": 92,
    "engagementScore": 78,
    "effectivenessScore": 85
  }
}
```

## Error Responses

All endpoints may return the following error responses:

```json
{
  "status": "error",
  "message": "Error description",
  "details": "Additional error details"
}
```

**Common Status Codes:**
- `200` - Success
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## Rate Limiting

API requests are rate limited:
- 100 requests per minute per user
- 1000 requests per hour per user

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1677235200
```

## Webhooks

The system can send webhooks for certain events:

1. New gifts discovered
2. Gift popularity threshold reached
3. System health alerts

Configure webhooks in the admin dashboard.
