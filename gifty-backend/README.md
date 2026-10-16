# Gifty Backend

This repository contains the backend API server for the Gifty application.

## Overview

The Gifty backend is a RESTful API built with Node.js and Express that provides all server-side functionality for the Gifty gift management application. It handles user authentication, database operations, event and gift tracking, budget management, and AI-powered gift suggestions.

## Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: Cookie-based with HTTP-only secure cookies
- **Security**: bcryptjs, helmet, express-rate-limit
- **File Handling**: multer
- **Email**: nodemailer
- **Logging**: winston
- **AI Integration**: OpenAI API
- **Web Search**: Brave Search API
- **Web Scraping**: Cheerio
- **Task Scheduling**: node-cron
- **String Comparison**: similarity

## Directory Structure

```
/gifty-backend
├── config/             # Database and application configuration
├── controllers/        # Request handlers for API endpoints
├── middleware/         # Custom middleware (auth, error handling, etc.)
├── models/             # Mongoose data models
├── routes/             # API route definitions
├── services/           # Business logic and external service integration
├── schedulers/         # Background job schedulers
├── utils/              # Utility functions and helpers
├── uploads/            # Storage for uploaded files
├── logs/               # Application logs
├── docs/               # Documentation files
├── migrations/         # Database migration scripts
├── tests/              # Test files
├── legacy-scripts/     # Legacy scripts
├── server.js           # Application entry point
```

## API Endpoints

The API is organized into the following resource-based routes:

- **/api/users** - User registration, authentication, and management
- **/api/budgets** - Budget creation and tracking
- **/api/events** - Event management
- **/api/eventTypes** - Event type management
- **/api/gifts** - Gift tracking and management
- **/api/gift-library** - Discovered gifts library and hybrid suggestions
- **/api/recipients** - Recipient information management
- **/api/notifications** - Notification handling
- **/api/reviews** - Gift review management
- **/api/tags** - Tag management
- **/api/vendors** - Vendor information
- **/api/settings** - Application settings
- **/api/email-config** - Email configuration
- **/api/feedback** - Feedback logging
- **/api/holidays** - Holiday management and event generation
- **/api/database** - Database operations
- **/api/cleanup** - Cleanup operations

## Services

### Authentication & Security

- **authController.js** - Handles token refresh and authentication operations
- **cookieUtils.js** - Manages secure HTTP-only cookies for authentication
- **securityHeadersMiddleware.js** - Configures HTTP security headers
- **xssMiddleware.js** - Protects against cross-site scripting attacks
- **rateLimitMiddleware.js** - Implements rate limiting for API endpoints
- **validationMiddleware.js** - Validates user input using express-validator

### Gift Suggestion Services

- **aiService.js** - Basic gift suggestion engine using OpenAI
- **enhancedAiService.js** - Advanced suggestion engine with personalization and constraint validation
- **webSearchAiService.js** - Web-Enhanced mode: AI suggestions checked against a Brave web search, with links to related pages it found
- **giftDiscoveryService.js** - Automated web scraping and gift discovery service
- **hybridSuggestionService.js** - Hybrid recommendation engine combining discovered and AI-generated gifts

### Notification System

- **notificationService.js** - Handles event reminders and notifications
- **emailService.js** - Email delivery service
- **catchupService.js** - Processes missed notifications during downtime

### Holiday System

- **holidayService.js** - Manages holiday generation based on user preferences
- Supports multiple countries and categories (national, religious, cultural, international)
- Automatically creates events for holidays based on user preferences

### Automated Operations

- **cleanupService.js** - Intelligent data cleanup with configurable retention
- **trendAnalysisService.js** - Machine learning-based gift pattern analysis
- **discoveryScheduler.js** - Multi-threaded gift discovery with load balancing
- **backupService.js** - Automated database backup with Docker integration

```bash
# Operations Endpoints
POST /api/cleanup/run                # Manual cleanup execution
GET /api/cleanup/status              # Cleanup task status
POST /api/database/backup            # Create database backup
```

## Production Features

### Health Monitoring & Observability

Comprehensive monitoring system for production environments:

- **Multi-level Health Checks**: Liveness, readiness, and detailed health endpoints
- **System Metrics**: Memory usage, CPU load, uptime, and performance statistics
- **Component Status**: Database, Redis, circuit breakers, and queue monitoring
- **Structured Logging**: Winston-based JSON logging with correlation IDs
- **Performance Tracking**: Request timing, throughput, and error rate monitoring
- **Container Awareness**: Docker-optimized logging and health checks

### Database Backup & Recovery

Automated backup system with Docker integration:

- **Automated Backups**: Scheduled MongoDB backups with retention policies
- **Docker Integration**: Seamless backup from containerized environments
- **One-Click Restore**: Simple API-based database restoration
- **Backup Management**: List, download, and manage backup files
- **Data Integrity**: Verification and validation of backup contents

### Security & Authentication

Enterprise-grade security implementation:

- **HTTP-Only Secure Cookies**: XSS-resistant authentication tokens
- **Dual Token System**: Separate access and refresh tokens with rotation
- **Rate Limiting**: Configurable API endpoint protection
- **Security Headers**: Comprehensive HTTP security headers via helmet
- **Input Validation**: XSS protection and data sanitization
- **Session Management**: Redis-backed session storage with TTL
- **CORS Configuration**: Secure cross-origin request handling

### Circuit Breaker Pattern

Resilience for external API dependencies:

- **OpenAI Circuit Breaker**: Automatic failover for AI services
- **Brave Search Protection**: Resilient web search integration
- **Fallback Strategies**: Graceful degradation when services are unavailable
- **Statistics Tracking**: Success/failure rates and performance metrics
- **Automatic Recovery**: Self-healing when services become available

### Hybrid Gift Discovery Engine

Advanced AI-powered discovery system with real-world data integration:

- **Multi-Source Architecture**: Combines AI creativity with web-discovered products
- **Automated Discovery**: Background processing with configurable intervals
- **Intelligent Deduplication**: Similarity-based duplicate detection
- **Performance Analytics**: Comprehensive metrics and engagement tracking
- **Circuit Breaker Protection**: Resilient external API integration
- **Preference Learning**: User feedback integration for improved suggestions

```bash
# API Endpoints
GET /api/gift-library/suggestions    # Get hybrid suggestions
GET /api/gift-library/discovered     # Browse discovered gifts
POST /api/gift-library/feedback      # Submit gift feedback
GET /api/gift-library/system-health  # Gift library size and health
```

### Smart Notification System

Intelligent notification system with offline recovery capabilities:

- **Catchup Processing**: Automatic recovery of missed notifications during downtime
- **Multi-Channel Delivery**: Email, browser, and in-app notifications
- **Intelligent Scheduling**: Optimal timing based on user behavior
- **Retroactive Handling**: Special processing for delayed notifications
- **Preference Management**: Granular user control over notification types
- **Performance Monitoring**: Delivery tracking and success metrics

```bash
# Management Endpoints
GET /api/notifications/pending       # View pending notifications
POST /api/notifications/catchup      # Trigger catchup processing
GET /api/notifications/stats         # View delivery statistics
```

### Enterprise Email System

Production-grade email delivery with provider support:

- **Provider Integration**: Gmail, Outlook, Yahoo, and custom SMTP support
- **Secure Authentication**: App passwords and OAuth2 support
- **Template System**: HTML and text email templates
- **Delivery Tracking**: Success/failure monitoring and retry logic
- **Configuration Testing**: Built-in email testing and validation
- **Performance Optimization**: Connection pooling and rate limiting

```bash
# Configuration Endpoints
POST /api/email-config/test          # Test email configuration
GET /api/email-config/providers      # List supported providers
POST /api/email-config/setup         # Configure SMTP settings
```

### Web-Enhanced Mode

Web-Enhanced suggestions are Enhanced AI suggestions checked against a
Brave web search (needs `BRAVE_SEARCH_API_KEY`):

- Each of the top suggestions is searched by name; up to 3 of the pages the
  search returned are saved with the gift and shown as "Related pages on the web"
  links (http/https only, host taken from the URL)
- Only links the search returned in that generation are kept, never a link
  the AI wrote, and only pages that share two distinctive words with the
  suggestion's name (related pages, not necessarily the product itself)
- No price, availability or rating is taken from the web: prices are the
  AI's estimates
- When the search fails or finds nothing, the page says so

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- OpenAI API key (for gift suggestions)
- Brave Search API key (for web-enhanced suggestions and gift discovery)

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure environment variables:
   ```
   cp .env.example .env
   # Edit .env with your configuration
   ```
4. Initialize the database:
   ```
   npm run db:init
   ```
5. Start the development server:
   ```
   npm start
   ```

### Environment Variables

Key environment variables include:

- `PORT` - Server port (default: 5000)
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `SESSION_SECRET` - Secret key for Express sessions
- `OPENAI_API_KEY` - API key for OpenAI integration
- `BRAVE_SEARCH_API_KEY` - API key for Brave Search (required for web discovery)
- `DISCOVERY_INTERVAL` - Gift discovery interval in milliseconds (default: 3600000)
- `MAX_GIFTS_PER_DISCOVERY` - Maximum number of gifts to discover in one batch
- `SIMILARITY_THRESHOLD` - Threshold for determining duplicate gifts (default: 0.85)
- `EMAIL_*` - Email service configuration
- `COOKIE_SECRET` - Secret key for cookie signatures

## Scripts

- `npm start` - Start the server with nodemon for development
- `npm test` - Run tests with Jest
- `npm run db:init` - Initialize the database with default data

## Security Features

### Cookie-Based Authentication

The application uses a secure cookie-based authentication system:

- **HTTP-Only Secure Cookies**: Prevents access via JavaScript, protecting against XSS attacks
- **Access & Refresh Tokens**: Separate tokens with different lifespans and paths
- **Token Refresh Mechanism**: Automatic refresh of expired access tokens
- **Secure Headers**: Comprehensive security headers using helmet
- **XSS Protection**: Input sanitization and validation
- **Rate Limiting**: Protection against brute force attacks
- **CORS Configuration**: Properly configured for credentials

Additional security features include:
- Password hashing with bcrypt
- Input validation with express-validator
- Error handling middleware

## Logging

The application uses Winston for structured logging with different log levels:
- Error logs for exceptions and critical issues
- Info logs for regular operations
- Debug logs for development troubleshooting

Logs are stored in the `/logs` directory and are rotated automatically.

## Documentation

Additional documentation is available in the `/docs` directory:
- `gift-suggestions-api.md` - Gift suggestion API details
- `multi-source-discovery-api.md` - Multi-source discovery API
- `multi-source-discovery-deployment.md` - Deployment guide
- `notification-catchup-system.md` - Notification system details
- `notification-debugging.md` - Debugging information
- `smtp-configuration.md` - Email configuration guide
- `web-search-migration.md` - Web search enhancement migration