/**
 * Test data and utilities for E2E tests
 * Provides realistic test data and helper functions
 */

// Test user credentials
export const TEST_USERS = {
  valid: {
    username: 'testuser',
    email: 'test@example.com',
    password: 'Test123!',
    firstName: 'Test',
    lastName: 'User'
  },
  admin: {
    username: 'admin',
    email: 'admin@example.com',
    password: 'Admin123!',
    firstName: 'Admin',
    lastName: 'User'
  },
  new: {
    username: 'newuser',
    email: 'newuser@example.com',
    password: 'NewUser123!',
    firstName: 'New',
    lastName: 'User'
  }
};

// Test recipient data
export const TEST_RECIPIENTS = {
  brother: {
    name: 'John Doe',
    relation: 'Brother',
    birthdate: '1990-05-15',
    interests: 'Technology, Gaming, Sports',
    notes: 'Loves the latest gadgets and plays video games in his free time.'
  },
  sister: {
    name: 'Jane Smith',
    relation: 'Sister',
    birthdate: '1992-08-22',
    interests: 'Art, Music, Reading',
    notes: 'Creative person who enjoys painting and playing piano.'
  },
  friend: {
    name: 'Mike Wilson',
    relation: 'Friend',
    birthdate: '1988-12-03',
    interests: 'Fitness, Cooking, Travel',
    notes: 'Marathon runner who loves trying new recipes.'
  },
  colleague: {
    name: 'Sarah Johnson',
    relation: 'Colleague',
    birthdate: '1985-03-10',
    interests: 'Photography, Nature, Hiking',
    notes: 'Nature photographer who loves outdoor adventures.'
  }
};

// Test event data
export const TEST_EVENTS = {
  birthday: {
    title: 'John\'s Birthday',
    eventType: 'Birthday',
    date: '2024-12-25',
    recipient: 'John Doe',
    notes: 'Annual birthday celebration',
    recurring: false
  },
  christmas: {
    title: 'Christmas 2024',
    eventType: 'Holiday',
    date: '2024-12-25',
    recipient: 'All',
    notes: 'Family Christmas celebration',
    recurring: true,
    recurringType: 'yearly'
  },
  anniversary: {
    title: 'Wedding Anniversary',
    eventType: 'Anniversary',
    date: '2024-06-15',
    recipient: 'Jane Smith',
    notes: 'Special anniversary gift needed',
    recurring: true,
    recurringType: 'yearly'
  }
};

// Test gift data
export const TEST_GIFTS = {
  electronics: {
    name: 'Wireless Headphones',
    category: 'Electronics',
    price: 199.99,
    description: 'High-quality noise-canceling wireless headphones',
    url: 'https://example.com/headphones',
    recipient: 'John Doe',
    event: 'John\'s Birthday'
  },
  book: {
    name: 'Science Fiction Novel',
    category: 'Books',
    price: 24.99,
    description: 'Latest bestselling sci-fi novel',
    url: 'https://example.com/book',
    recipient: 'Jane Smith',
    event: 'Christmas 2024'
  },
  clothing: {
    name: 'Running Shoes',
    category: 'Clothing',
    price: 129.99,
    description: 'Professional running shoes for marathons',
    url: 'https://example.com/shoes',
    recipient: 'Mike Wilson',
    event: 'Christmas 2024'
  }
};

// Test budget data
export const TEST_BUDGETS = {
  overall: {
    year: 2024,
    totalBudget: 2000,
    currency: 'USD',
    categories: {
      'Electronics': 500,
      'Books': 200,
      'Clothing': 400,
      'Other': 900
    }
  },
  recipient: {
    recipientName: 'John Doe',
    allocatedAmount: 300,
    allocationType: 'fixed',
    notes: 'Birthday and Christmas budget'
  }
};

// Invalid test data for negative testing
export const INVALID_DATA = {
  users: {
    invalidEmail: {
      email: 'invalid-email',
      password: 'Test123!',
      firstName: 'Test',
      lastName: 'User'
    },
    weakPassword: {
      email: 'test@example.com',
      password: '123',
      firstName: 'Test',
      lastName: 'User'
    },
    emptyFields: {
      email: '',
      password: '',
      firstName: '',
      lastName: ''
    }
  },
  recipients: {
    emptyName: {
      name: '',
      relation: 'Brother',
      interests: 'Technology'
    },
    longName: {
      name: 'A'.repeat(100),
      relation: 'Friend',
      interests: 'Various'
    }
  }
};

// Helper functions for test data generation
export const generateRandomUser = () => {
  const timestamp = Date.now();
  return {
    username: `testuser${timestamp}`,
    email: `testuser${timestamp}@example.com`,
    password: 'Test123!',
    confirmPassword: 'Test123!',
    firstName: `TestUser${timestamp}`,
    lastName: 'Generated',
    dateOfBirth: '1990-01-01'
  };
};

export const generateRandomRecipient = () => {
  const timestamp = Date.now();
  const relations = ['Friend', 'Family', 'Colleague', 'Neighbor'];
  const interests = ['Technology', 'Sports', 'Art', 'Music', 'Travel', 'Cooking'];
  
  return {
    name: `Test Recipient ${timestamp}`,
    relation: relations[Math.floor(Math.random() * relations.length)],
    birthdate: '1990-01-01',
    interests: interests.slice(0, 2).join(', '),
    notes: `Generated test recipient for timestamp ${timestamp}`
  };
};

export const generateRandomEvent = (recipientName = 'Test Recipient') => {
  const timestamp = Date.now();
  const eventTypes = ['Birthday', 'Holiday', 'Anniversary', 'Graduation'];
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + Math.floor(Math.random() * 365));
  
  return {
    title: `Test Event ${timestamp}`,
    eventType: eventTypes[Math.floor(Math.random() * eventTypes.length)],
    date: futureDate.toISOString().split('T')[0],
    recipient: recipientName,
    notes: `Generated test event for ${recipientName}`,
    recurring: false
  };
};

// Test environment configuration
export const TEST_CONFIG = {
  // Timeouts
  defaultTimeout: 10000,
  longTimeout: 30000,
  apiTimeout: 15000,
  
  // URLs
  baseURL: 'http://localhost:3000',
  apiBaseURL: 'http://localhost:5000/api',
  
  // File paths for uploads
  testImages: {
    profile: './e2e/fixtures/test-profile.jpg',
    recipient: './e2e/fixtures/test-recipient.jpg'
  },
  
  // Performance thresholds
  performance: {
    pageLoadTime: 3000,
    apiResponseTime: 2000,
    chartRenderTime: 1000
  },
  
  // Browser viewport sizes for responsive testing
  viewports: {
    mobile: { width: 375, height: 667 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1920, height: 1080 }
  }
};

// Utility functions
export const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
};

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const generateUniqueId = () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Data cleanup helpers
export const getTestUserEmail = () => `cleanup_test_${Date.now()}@example.com`;

export const cleanupTestData = {
  async deleteTestUsers(page) {
    // Helper to clean up test users after tests
    // Implementation would depend on available admin endpoints
  },
  
  async resetTestDatabase(page) {
    // Helper to reset test database to clean state
    // Implementation would depend on available reset endpoints
  }
};

// Mock API response data
export const MOCK_API_RESPONSES = {
  userProfile: {
    id: 1,
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    profilePicture: null,
    preferences: {
      currency: 'USD',
      notifications: true
    }
  },
  
  recipients: [
    {
      id: 1,
      name: 'John Doe',
      relation: 'Brother',
      interests: ['Technology', 'Gaming'],
      profilePicture: null,
      birthdate: '1990-05-15'
    }
  ],
  
  events: [
    {
      id: 1,
      title: 'John\'s Birthday',
      date: '2024-12-25',
      eventType: 'Birthday',
      recipient: 'John Doe',
      recurring: false
    }
  ],
  
  gifts: [
    {
      id: 1,
      name: 'Wireless Headphones',
      price: 199.99,
      category: 'Electronics',
      recipient: 'John Doe',
      purchased: false,
      favorite: false
    }
  ]
};

export default {
  TEST_USERS,
  TEST_RECIPIENTS,
  TEST_EVENTS,
  TEST_GIFTS,
  TEST_BUDGETS,
  INVALID_DATA,
  TEST_CONFIG,
  generateRandomUser,
  generateRandomRecipient,
  generateRandomEvent,
  formatCurrency,
  formatDate,
  sleep,
  generateUniqueId,
  MOCK_API_RESPONSES
};