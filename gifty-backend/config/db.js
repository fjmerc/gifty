const mongoose = require('mongoose');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

// Load environment variables
dotenv.config();

// Track connection state
let isConnected = false;
let connectionPromise = null;

const connectDB = async () => {
  // If already connecting, return the existing promise
  if (connectionPromise) {
    logger.info('Connection already in progress, reusing promise');
    return connectionPromise;
  }
  
  // If already connected, return existing connection
  if (isConnected && mongoose.connection.readyState === 1) {
    logger.info('Using existing MongoDB connection...');
    return mongoose.connection;
  }
  
  try {
    // Create a new connection promise
    connectionPromise = mongoose.connect(process.env.MONGO_URI || 'mongodb://mongo:27017/gifty', {
      // Connection pool settings
      maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '20'),
      minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || '5'),
      maxIdleTimeMS: parseInt(process.env.MONGO_MAX_IDLE_TIME_MS || '60000'),
      // Buffering options
      bufferCommands: true,
      // Disable session expiration issues
      autoCreate: true,
      // Timeout settings
      connectTimeoutMS: parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS || '10000'),
      socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS || '45000'),
      // Heartbeat settings
      heartbeatFrequencyMS: parseInt(process.env.MONGO_HEARTBEAT_FREQUENCY_MS || '10000'),
      // Server selection timeout
      serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || '15000'),
    });
    
    const connection = await connectionPromise;

    isConnected = true;
    logger.info('MongoDB connected with pooling configuration...');
    
    // Log connection pool statistics
    const db = mongoose.connection;
    
    // Set up connection event handlers
    db.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err}`);
      isConnected = false;
    });
    
    db.once('open', () => {
      logger.info('MongoDB connection pool established');
      isConnected = true;
    });
    
    db.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      isConnected = false;
      connectionPromise = null; // Clear the promise on disconnection
    });
    
    db.on('reconnected', () => {
      logger.info('MongoDB reconnected');
      isConnected = true;
    });
    
    // Return the connection
    return connection;
  } catch (err) {
    logger.error(`Error connecting to MongoDB: ${err.message}`);
    isConnected = false;
    connectionPromise = null; // Clear the promise on error
    
    // Throw the error, don't exit process (let caller decide)
    throw err;
  }
};

// Clean disconnection function
const disconnectDB = async () => {
  if (!isConnected || mongoose.connection.readyState !== 1) {
    logger.info('No active MongoDB connection to close');
    return;
  }
  
  try {
    await mongoose.connection.close(false); // Don't force close
    isConnected = false;
    connectionPromise = null;
    logger.info('MongoDB connection closed');
  } catch (err) {
    logger.error(`Error closing MongoDB connection: ${err.message}`);
    throw err;
  }
};

module.exports = {
  connectDB,
  disconnectDB,
  getConnectionStatus: () => isConnected
};
