## 1. Database Indexing & Query Optimization

- **Connection Pooling:** Implemented configurable MongoDB connection pooling (`config/db.js`)
- **Strategic Indexes:**
  - User-based, compound, and text indexes for `Gift` and `Recipient` models
- **Query Efficiency:**
  - Field-level query projection in controllers
  - Pagination with sorting/filtering on gift endpoints
- **Connection Monitoring:** Enabled monitoring for MongoDB connections

---

## 2. Caching Strategy with Redis

- **Redis Infrastructure:**
  - Redis service added to `docker-compose.yml` with persistence and UI
- **Redis Client:** Connection pooling via `config/redis/index.js`
- **Response Caching:** Middleware-based caching for read-heavy endpoints
- **Cache Invalidation:** Automatic invalidation on data updates
- **Session Store:** Migrated from in-memory to Redis for session storage
- **TTL Configuration:** Tiered TTLs based on data volatility

---

## 3. API Performance & Bottlenecks

- **Background Processing:**
  - Gift suggestion generation offloaded to a Bull queue (`queues/index.js`)
  - Includes job status polling and fallback support
- **Performance Enhancements:**
  - Response time tracking middleware
  - Timeout handling to prevent hanging requests
  - Circuit breakers for external APIs (OpenAI, Brave Search)
  - Rate limiting for high-traffic endpoints

---

## 4. Load Handling & Scalability

- **Single process:** one Node process serves the API and the React build (no PM2)
- **Health Checks:**
  - `/api/health/liveness`, `/readiness`, `/detailed` endpoints for monitoring
- **Graceful Shutdown:** Clean shutdown support for all processes

---

## 5. Memory Management

- **Cleanup Service:**
  - Handles stale notifications, unused suggestions, cache keys and its own old job records
- **Monitoring & Resource Control:**
  - Middleware for memory usage tracking
  - Node memory limits and manual GC triggers for critical loads

---

## Key Configuration Files

- `docker-compose.yml` – Includes Redis setup  
- `config/redis/index.js` – Redis client connection logic  
- `queues/index.js` – Bull queue setup for async jobs  
- `.env` – Redis and MongoDB tuning variables  

---

## Troubleshooting Tips

- **Module Errors:**
  ```bash
  npm install
  ```

- **Redis Issues:**
  ```bash
  docker ps
  docker-compose up -d redis
  ```

- **Object Reference Errors:**
  ```bash
  rm -rf node_modules/.cache
  npm start
  ```

---

## Production Commands

- **Start:** the Docker image runs one Node process (`node server.js`); see the root README.

- **Monitor App:**
  ```bash
  docker compose logs -f gifty
  curl http://localhost:3000/api/health
  ```

---

## Additional Improvements

- Enhanced error handling with better diagnostics  
- Contextual logging for traceability  
- Improved documentation and code comments  
- System-wide observability with metrics and status endpoints

---