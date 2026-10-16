const fs = require('fs');
const path = require('path');
const express = require('express');

// Serve the React production build and fall back to index.html for
// client-side routes. Must be mounted after the /api 404 handler.
const mountSpa = (app, publicDir) => {
  const indexFile = path.join(publicDir, 'index.html');
  if (!fs.existsSync(indexFile)) return false;

  app.use(express.static(publicDir, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}static${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));

  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });
  return true;
};

module.exports = { mountSpa };
