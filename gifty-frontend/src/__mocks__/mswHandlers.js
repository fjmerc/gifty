import { http, HttpResponse } from 'msw';

// API base URL
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

// Mock data
const mockUser = {
  id: 'test-user-id',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  profilePicture: null,
  createdAt: '2023-01-01T00:00:00.000Z',
  updatedAt: '2023-01-01T00:00:00.000Z',
};

const mockGifts = [
  {
    _id: 'gift-1',
    id: 'gift-1',
    name: 'Test Gift 1',
    description: 'A test gift for testing',
    price: 25.99,
    category: 'electronics',
    imageUrl: 'https://example.com/test-gift-1.jpg',
    vendor: 'Test Vendor',
    url: 'https://example.com/gift-1',
    status: 'purchased',
    purchaseDate: '2024-01-15T10:30:00Z',
    recipient: {
      _id: 'recipient-1',
      firstName: 'John',
      lastName: 'Doe'
    }
  },
  {
    _id: 'gift-2',
    id: 'gift-2',
    name: 'Test Gift 2',
    description: 'Another test gift',
    price: 49.99,
    category: 'books',
    imageUrl: 'https://example.com/test-gift-2.jpg',
    vendor: 'Another Vendor',
    url: 'https://example.com/gift-2',
    status: 'purchased',
    purchaseDate: '2024-02-20T14:15:00Z',
    recipient: {
      _id: 'recipient-2',
      firstName: 'Jane',
      lastName: 'Smith'
    }
  },
  {
    _id: 'gift-3',
    id: 'gift-3',
    name: 'Test Gift 3',
    description: 'A wishlist gift',
    price: 75.00,
    category: 'home',
    imageUrl: 'https://example.com/test-gift-3.jpg',
    vendor: 'Home Store',
    url: 'https://example.com/gift-3',
    status: 'wishlist'
  },
];

const mockRecipients = [
  {
    _id: 'recipient-1',
    id: 'recipient-1',
    firstName: 'John',
    lastName: 'Doe',
    relationship: 'friend',
    age: 25,
    interests: ['reading', 'gaming'],
    budget: 50,
    tags: [
      { _id: 'tag-1', name: 'tech-savvy' },
      { _id: 'tag-2', name: 'bookworm' }
    ]
  },
  {
    _id: 'recipient-2',
    id: 'recipient-2',
    firstName: 'Jane',
    lastName: 'Smith',
    relationship: 'family',
    age: 30,
    interests: ['cooking', 'travel'],
    budget: 100,
    tags: [
      { _id: 'tag-3', name: 'foodie' },
      { _id: 'tag-4', name: 'wanderlust' }
    ]
  },
];

const mockNotifications = [
  {
    _id: 'notification-1',
    event: {
      name: 'Birthday Party',
      recipient: {
        firstName: 'John',
        lastName: 'Doe',
      },
    },
    isRead: false,
    createdAt: '2023-01-01T00:00:00.000Z',
  },
];

// Request handlers
export const handlers = [
  // Auth endpoints
  http.post(`${API_BASE_URL}/api/auth/login`, async ({ request }) => {
    const body = await request.json();
    
    if (body.email === 'test@example.com' && body.password === 'password') {
      return HttpResponse.json({
        message: 'Login successful',
        user: mockUser,
      }, { status: 200 });
    }
    
    return HttpResponse.json({
      message: 'Invalid credentials',
    }, { status: 401 });
  }),

  http.post(`${API_BASE_URL}/api/auth/register`, async ({ request }) => {
    const body = await request.json();
    
    return HttpResponse.json({
      message: 'Registration successful',
      user: { ...mockUser, ...body },
    }, { status: 201 });
  }),

  http.post(`${API_BASE_URL}/api/auth/logout`, () => {
    return HttpResponse.json({
      message: 'Logout successful',
    }, { status: 200 });
  }),

  http.get(`${API_BASE_URL}/api/auth/profile`, () => {
    return HttpResponse.json(mockUser, { status: 200 });
  }),

  // User endpoints
  http.get(`${API_BASE_URL}/api/users/profile`, () => {
    return HttpResponse.json(mockUser, { status: 200 });
  }),

  http.put(`${API_BASE_URL}/api/users/profile`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      ...mockUser,
      ...body,
    }, { status: 200 });
  }),

  // Gift endpoints
  http.get(`${API_BASE_URL}/api/gifts`, ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const category = url.searchParams.get('category');
    
    let filteredGifts = [...mockGifts];
    
    if (category) {
      filteredGifts = filteredGifts.filter(gift => gift.category === category);
    }
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedGifts = filteredGifts.slice(startIndex, endIndex);
    
    // UserHome expects direct array format
    return HttpResponse.json(paginatedGifts, { status: 200 });
  }),

  http.get(`${API_BASE_URL}/api/gifts/:id`, ({ params }) => {
    const gift = mockGifts.find(g => g.id === params.id);
    
    if (!gift) {
      return HttpResponse.json({
        message: 'Gift not found',
      }, { status: 404 });
    }
    
    return HttpResponse.json(gift, { status: 200 });
  }),

  http.post(`${API_BASE_URL}/api/gifts`, async ({ request }) => {
    const body = await request.json();
    const newGift = {
      id: `gift-${Date.now()}`,
      ...body,
    };
    
    return HttpResponse.json(newGift, { status: 201 });
  }),

  // Recipient endpoints
  http.get(`${API_BASE_URL}/api/recipients`, () => {
    return HttpResponse.json(mockRecipients, { status: 200 });
  }),

  http.get(`${API_BASE_URL}/api/recipients/:id`, ({ params }) => {
    const recipient = mockRecipients.find(r => r.id === params.id);
    
    if (!recipient) {
      return HttpResponse.json({
        message: 'Recipient not found',
      }, { status: 404 });
    }
    
    return HttpResponse.json(recipient, { status: 200 });
  }),

  http.post(`${API_BASE_URL}/api/recipients`, async ({ request }) => {
    const body = await request.json();
    const newRecipient = {
      id: `recipient-${Date.now()}`,
      ...body,
    };
    
    return HttpResponse.json(newRecipient, { status: 201 });
  }),

  // Notification endpoints
  http.get(`${API_BASE_URL}/api/notifications`, ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedNotifications = mockNotifications.slice(startIndex, endIndex);
    
    return HttpResponse.json({
      notifications: paginatedNotifications,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(mockNotifications.length / limit),
        totalItems: mockNotifications.length,
      },
    }, { status: 200 });
  }),

  http.get(`${API_BASE_URL}/api/notifications/stats`, () => {
    const unreadCount = mockNotifications.filter(n => !n.isRead).length;
    return HttpResponse.json({
      unreadCount,
      totalCount: mockNotifications.length,
    }, { status: 200 });
  }),

  // Event endpoints
  http.get(`${API_BASE_URL}/api/events`, () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const mockEvents = [
      {
        _id: 'event-1',
        name: "John's Birthday",
        date: tomorrow.toISOString(),
        type: 'birthday',
        recipient: {
          _id: 'recipient-1',
          firstName: 'John',
          lastName: 'Doe'
        },
        isSystemGenerated: false
      },
      {
        _id: 'event-2',
        name: 'Christmas',
        date: nextWeek.toISOString(),
        type: { name: 'Holiday' },
        recipient: {
          _id: 'system-holiday',
          firstName: 'Holiday',
          lastName: 'Event',
          isSystemAccount: true
        },
        isSystemGenerated: true
      },
      {
        _id: 'event-3',
        name: "Jane's Anniversary",
        date: nextMonth.toISOString(),
        type: 'anniversary',
        recipient: {
          _id: 'recipient-2',
          firstName: 'Jane',
          lastName: 'Smith'
        },
        isSystemGenerated: false
      }
    ];

    return HttpResponse.json(mockEvents, { status: 200 });
  }),

  http.post(`${API_BASE_URL}/api/events`, async ({ request }) => {
    const body = await request.json();
    const newEvent = {
      id: `event-${Date.now()}`,
      ...body,
    };
    
    return HttpResponse.json(newEvent, { status: 201 });
  }),

  // Budget endpoints
  http.get(`${API_BASE_URL}/api/budgets/overall/:year`, ({ params }) => {
    const mockBudget = {
      _id: 'budget-overall-2024',
      amount: 1000,
      currency: 'USD',
      year: parseInt(params.year)
    };
    return HttpResponse.json(mockBudget, { status: 200 });
  }),

  http.get(`${API_BASE_URL}/api/budgets/analytics/:year`, ({ params }) => {
    const mockAnalytics = {
      totalSpent: 250,
      totalBudget: 1000,
      monthlySpending: [
        50, 0, 75, 25, 0, 0, 100, 0, 0, 0, 0, 0  // Jan through Dec
      ],
      categoryBreakdown: {
        electronics: 125,
        books: 75,
        home: 50
      }
    };
    return HttpResponse.json(mockAnalytics, { status: 200 });
  }),

  http.post(`${API_BASE_URL}/api/budgets/overall`, async ({ request }) => {
    const body = await request.json();
    const newBudget = {
      _id: 'budget-overall-new',
      ...body,
      year: new Date().getFullYear()
    };
    return HttpResponse.json(newBudget, { status: 201 });
  }),

  http.put(`${API_BASE_URL}/api/budgets/overall/:year`, async ({ request, params }) => {
    const body = await request.json();
    const updatedBudget = {
      _id: 'budget-overall-2024',
      ...body,
      year: parseInt(params.year)
    };
    return HttpResponse.json(updatedBudget, { status: 200 });
  }),

  // Holiday endpoints
  http.post(`${API_BASE_URL}/api/holidays/regenerate`, () => {
    return HttpResponse.json({
      success: true,
      created: 5,
      message: 'Holiday events regenerated successfully'
    }, { status: 200 });
  }),

  // Legacy budget endpoint
  http.get(`${API_BASE_URL}/api/budgets`, () => {
    return HttpResponse.json({
      overallBudget: 500,
      remainingBudget: 350,
      recipientBudgets: [],
    }, { status: 200 });
  }),

  // Analytics endpoints
  http.get(`${API_BASE_URL}/api/analytics/feedback`, () => {
    return HttpResponse.json({
      totalFeedback: 0,
      averageRating: 0,
      categoryDistribution: {},
      sentimentAnalysis: {
        positive: 0,
        neutral: 0,
        negative: 0,
      },
    }, { status: 200 });
  }),

  // Catch-all handler for unmatched requests
  http.get('*', ({ request }) => {
    console.warn(`Unhandled GET request: ${request.url}`);
    return HttpResponse.json(
      { message: 'Not found' },
      { status: 404 }
    );
  }),

  http.post('*', ({ request }) => {
    console.warn(`Unhandled POST request: ${request.url}`);
    return HttpResponse.json(
      { message: 'Not found' },
      { status: 404 }
    );
  }),
];

// Error handlers for testing error states
export const errorHandlers = [
  http.get(`${API_BASE_URL}/api/auth/profile`, () => {
    return HttpResponse.json(
      { message: 'Unauthorized' },
      { status: 401 }
    );
  }),

  http.get(`${API_BASE_URL}/api/gifts`, () => {
    return HttpResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }),
];
