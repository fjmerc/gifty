/**
 * Enhanced security headers middleware
 */
const helmet = require('helmet');
const { isHttps } = require('../config/runtime');

/**
 * Configure security headers
 * @param {Object} app - Express app instance
 */
const configureSecurityHeaders = (app) => {
  const isProduction = process.env.NODE_ENV === 'production';

  // Use helmet with enhanced settings
  app.use(
    helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Only the app's own script files: the build inlines nothing
          // (INLINE_RUNTIME_CHUNK=false, config-overrides) and needs no eval
          scriptSrc: ["'self'"],
          // Quicksand is bundled with the frontend; no external stylesheets or fonts
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", "data:"],
          // Product images in suggestions and Gift Explorer come from retailers' CDNs
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          // NotificationContext plays an inline data: URI mp3
          mediaSrc: ["'self'", "data:"],
          connectSrc: isProduction ? ["'self'"] : ["'self'", '*'],
          // Force-upgrading over plain HTTP breaks every API call on LAN installs;
          // only enforce it when the instance is actually served over TLS.
          upgradeInsecureRequests: isHttps() ? [] : null
        }
      },
      
      // Cross-Origin Resource Policy
      crossOriginResourcePolicy: { 
        policy: "same-site" 
      },
      
      // Cross-Origin Opener Policy
      crossOriginOpenerPolicy: { 
        policy: "same-origin" 
      },
      
      // XSS Protection
      xssFilter: true,
      
      // Prevent MIME type sniffing
      noSniff: true,
      
      // Hide X-Powered-By header
      hidePoweredBy: true,
      
      // HTTP Strict Transport Security — only meaningful under TLS. Sending
      // it over plain HTTP poisons the browser's HSTS cache for the whole
      // host and force-upgrades http://localhost to https, breaking dev.
      // HSTS only means something over TLS; key it off GIFTY_URL like the other https-only settings
      hsts: isHttps()
        ? {
            maxAge: 15552000, // 180 days in seconds
            includeSubDomains: true,
            preload: true
          }
        : false,
      
      // Referrer Policy
      referrerPolicy: {
        policy: "strict-origin-when-cross-origin"
      }
    })
  );
  
  // Add additional headers
  app.use((req, res, next) => {
    // Add Feature-Policy header
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()'
    );
    
    // Add Cache-Control header
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    
    // Add X-Content-Type-Options header
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Add X-Frame-Options header
    res.setHeader('X-Frame-Options', 'DENY');
    
    next();
  });
};

module.exports = configureSecurityHeaders;
