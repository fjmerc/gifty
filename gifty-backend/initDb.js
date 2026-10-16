require('dotenv').config();
const mongoose = require('mongoose');
const { initializeDatabase } = require('./utils/dbInitializer');
const logger = require('./utils/logger');

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    try {
      logger.info('Connected to MongoDB');
      
      // Initialize database with default data
      const result = await initializeDatabase();
      
      // Log results
      logger.info('Database initialization completed:');
      
      if (result.eventTypesSeeded > 0) {
        logger.info(`- Added ${result.eventTypesSeeded} event types`);
      } else {
        logger.info('- Event types already exist, none added');
      }
      
      // Add future initialization results here
      
      logger.info('Database is ready for production use');
    } catch (error) {
      logger.error('Database initialization failed:', error);
    } finally {
      await mongoose.disconnect();
      logger.info('Database connection closed');
    }
  })
  .catch(err => {
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  });
