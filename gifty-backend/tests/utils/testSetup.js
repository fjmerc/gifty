// tests/utils/testSetup.js
const mongoose = require('mongoose');

// MongoDB connection URI for testing
const MONGO_URI = 'mongodb://localhost:27017/gifty-test';

module.exports = {
  /**
   * Connect to the test database.
   */
  setupTestDB: async () => {
    try {
      // Close any existing connections
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        // Add a small delay to allow the connection to fully close
        await new Promise(resolve => setTimeout(resolve, 500)); 
      }
      
      // Connect with mongoose (options compatible with MongoDB 4.x+)
      await mongoose.connect(MONGO_URI);
      
      console.log(`MongoDB successfully connected to ${MONGO_URI}`);
    } catch (error) {
      console.error('Error connecting to test database:', error);
      throw error;
    }
  },

  /**
   * Drop database and close the connection.
   */
  teardownTestDB: async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.dropDatabase();
        
        // Clear cached models and schemas
        mongoose.models = {};
        mongoose.modelSchemas = {};
        
        // Disconnect from MongoDB - this will handle cleanup properly
        await mongoose.disconnect();
        
        // Add a delay to ensure full cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log('MongoDB connection closed and database dropped');
    } catch (error) {
      console.error('Error tearing down test database:', error);
      throw error;
    }
  },

  /**
   * Clear all collections in the database.
   */
  clearDatabase: async () => {
    try {
      if (mongoose.connection.readyState !== 1) {
        console.log('No active connection to clear collections');
        return;
      }

      const collections = mongoose.connection.collections;
      
      const clearPromises = [];
      for (const key in collections) {
        const collection = collections[key];
        clearPromises.push(collection.deleteMany({}));
      }
      
      await Promise.all(clearPromises);
      console.log('All collections cleared');
    } catch (error) {
      console.error('Error clearing database collections:', error);
      throw error;
    }
  }
};
