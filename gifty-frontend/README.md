# Gifty Frontend - Production-Ready React Application

## 📱 Project Overview

Enterprise-grade React frontend for the Gifty gift management application with comprehensive production features including Docker deployment, health monitoring, performance optimization, and secure authentication. Designed to provide an intuitive user experience for managing gifts, events, recipients, and budgets.

### Key Features

- **AI-Powered Gift Suggestions**: Get personalized gift ideas based on recipient preferences
- **Multi-Source Gift Discovery**: Browse thousands of curated gifts from across the web
- **Hybrid Suggestion Engine**: Combines discovered gifts with AI recommendations
- **Gift Management**: Track gift ideas, purchases, and history
- **Event Tracking**: Never miss an important date with calendar integration
- **Budget Planning**: Set spending limits and track your gift budget
- **Recipient Management**: Create detailed profiles with preferences and interests
- **Smart Notifications**: Get timely reminders for upcoming events
- **Gift Explorer**: Advanced filtering and infinite scroll for gift browsing
- **Analytics Dashboard**: View gift discovery metrics and engagement data
- **Holiday System**: Country and category-based holiday reminders
- **Retroactive Notifications**: Never miss notifications even when the server was offline
- **Email Configuration**: Support for Gmail, Outlook, Yahoo, and custom SMTP
- **Export Reminders**: Periodic prompts to back up gift data
- **Feedback Collection**: Fine-tune gift suggestions with user feedback

## 🚀 Technology Stack

- **React** (v18.3.1): Core UI library
- **React Router** (v6.24.1): Navigation and routing
- **Redux Toolkit** (v2.2.6): Global state management
- **Context API**: Authentication and notification state
- **Axios** (v1.7.2): API communication
- **Tailwind CSS** (v3.4.16): Utility-first styling
- **Chart.js** (v4.4.7) / **react-chartjs-2** (v5.2.0): Data visualization
- **FullCalendar** (v6.1.14): Calendar views and event management
- **React Hook Form** (v7.52.1): Form handling and validation
- **React-Toastify** (v11.0.5): Toast notifications
- **JWT**: (For token generation, stored securely in HTTP-only cookies)
- **Lucide React** (v0.468.0): Modern icon library
- **Font Awesome**: Comprehensive icon collection
- **React Feather**: Icon library
- **React Icons** (v5.4.0): Icon library collection
- **react-infinite-scroll-component** (v6.1.0): Infinite scrolling
- **DOMPurify**: HTML sanitization
- **Emotion**: Styled components
- **Material-UI**: UI component library
- **React Bootstrap**: Bootstrap components for React

## 🗂️ Directory Structure

```
gifty-frontend/
├── public/                 # Static files and index.html
├── src/                    # Source code
│   ├── assets/             # Images, icons, and other static assets
│   │   └── sounds/         # Audio files for notifications
│   ├── components/         # Reusable UI components
│   │   ├── analytics/      # Analytics and visualization components
│   │   ├── css/            # Component-specific styles
│   │   ├── forms/          # Form components (add/edit)
│   │   │   ├── css/        # Form-specific styles
│   │   │   └── js/         # Form components
│   │   ├── GiftExplorer/   # Gift discovery and browsing components
│   │   ├── js/             # General components
│   │   └── ui/             # UI elements and feedback components
│   ├── pages/              # Page-level components
│   │   ├── css/            # Page-specific styles
│   │   └── js/             # Page components
│   ├── utils/              # Utility functions
│   ├── slices/             # Redux slices
│   ├── App.js              # Main application component
│   ├── AuthContext.js      # Authentication context provider
│   ├── NotificationContext.js # Notification context provider
│   ├── ProtectedRoute.js   # Route protection component
│   ├── axiosInstance.js    # Configured Axios instance
│   ├── store.js            # Redux store configuration
│   └── index.js            # Application entry point
├── .env                    # Environment variables
├── package.json            # Dependencies and scripts
├── tailwind.config.js      # Tailwind CSS configuration
└── config-overrides.js     # react-app-rewired configuration
```

## 🧩 Component Hierarchy

```
App
├── AuthProvider
│   └── NotificationProvider
│       └── Router
│           ├── ScrollToTop
│           ├── SessionTimeout
│           ├── Header (on authenticated routes)
│           └── Routes
│               ├── Public Routes
│               │   ├── Home
│               │   ├── About
│               │   ├── Login
│               │   └── Register
│               └── Protected Routes (require authentication)
│                   ├── UserHome
│                   ├── Events
│                   ├── Gifts
│                   ├── Recipients
│                   ├── Budgets
│                   ├── Notifications
│                   ├── Settings
│                   ├── User Profile
│                   └── ...other protected pages
```

## 🔧 Setup and Installation

### Prerequisites

- Node.js (v16 or later)
- npm or yarn
- Gifty Backend API running (typically on http://localhost:5000)

### Installation Steps

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd gifty-frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   REACT_APP_API_BASE_URL=http://localhost:5000
   ```

4. Start the development server:
   ```bash
   npm start
   ```

5. The application will be available at http://localhost:3000

### Available Scripts

#### Development Scripts
```bash
npm start              # Development server with hot reload
npm run dev            # Alias for npm start
npm test              # Run test suite with coverage
npm run test:watch    # Run tests in watch mode
npm run test:e2e      # Run end-to-end tests with Playwright
```

#### Production Scripts
```bash
npm run build         # Create optimized production build
npm run build:analyze # Build with bundle analyzer
npm run serve         # Serve production build locally
npm run docker:build  # Build Docker container
npm run docker:run    # Run Docker container
```

#### Quality Assurance
```bash
npm run lint          # ESLint code analysis
npm run lint:fix      # Auto-fix ESLint issues
npm run format        # Prettier code formatting
npm run type-check    # TypeScript type checking
```

### Container Development

```bash
# Development with Docker
docker-compose up -d

# Watch logs
docker-compose logs -f frontend

# Access container shell
docker-compose exec frontend sh

# Rebuild container
docker-compose build frontend
```

## 🚀 Production Deployment

### Docker Deployment (Recommended)

#### Quick Production Setup
```bash
# Clone and setup
git clone <repository-url>
cd gifty-frontend

# Build production container
docker build -t gifty-frontend:latest .

# Run with health checks
docker run -d \
  --name gifty-frontend \
  --health-cmd="curl -f http://localhost:80/health || exit 1" \
  --health-interval=30s \
  --health-timeout=3s \
  --health-retries=3 \
  -p 3000:80 \
  -e BACKEND_HOST=your-backend-host \
  -e BACKEND_PORT=5000 \
  gifty-frontend:latest
```

#### Docker Compose Deployment
```bash
# Production deployment
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Health verification
curl http://localhost:3000/health

# Container monitoring
docker-compose ps
docker-compose logs frontend
```

### Environment Configuration

#### Production Environment Variables
```bash
# Application Configuration
REACT_APP_API_BASE_URL=https://your-api-domain.com/api
NODE_ENV=production

# Container Configuration
BACKEND_HOST=backend
BACKEND_PORT=5000

# Build Optimization
GENERATE_SOURCEMAP=false
INLINE_RUNTIME_CHUNK=false
```

### Health Monitoring

```bash
# Frontend health check
curl http://localhost:3000/health

# Container health status
docker inspect --format='{{.State.Health.Status}}' gifty-frontend

# Performance monitoring
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/
```

## ✨ Key Features

### Authentication and User Management

Gifty uses secure cookie-based authentication with HTTP-only cookies. The application includes:
- User registration and login with secure cookies
- Automatic token refresh mechanism
- Profile management
- Session timeout handling
- Protection against XSS attacks
- CORS configuration with credentials support

### Gift Management

- Create and track gift ideas
- AI-powered gift suggestions based on recipient preferences
- Multi-source gift discovery with thousands of curated options
- Hybrid suggestions combining discovered and AI-generated gifts
- Gift feedback collection to improve future suggestions
- Gift status tracking (idea, purchased, given)
- Source indicators for discovered vs AI-generated gifts

### Event Tracking

- Create and manage gift-giving events
- Calendar view for upcoming occasions
- Event reminders and notifications
- Recurring event support

### Smart Notifications

- Timely reminders for upcoming events
- Retroactive notifications when server was offline
- Browser notifications with permission handling
- Sound and visual alerts
- Notification snoozing
- Configurable notification settings
- Email notifications with SMTP configuration

### Holiday System

- Automatic reminders for holidays and special occasions
- Country-specific holiday calendars
- Configurable holiday categories (national, religious, cultural, international)
- Customizable reminder timing

### Budget Planning

- Set overall yearly gift budgets
- Assign budgets to specific recipients
- Budget analytics and visualization
- Budget status monitoring (normal, warning, critical)

### Recipient Management

- Create detailed recipient profiles
- Track preferences, interests, and sizes
- Associate recipients with events and gifts
- Recipient-specific budget allocation

### Analytics

- Budget utilization visualization
- Gift suggestion feedback analytics
- Category distribution analysis
- Spending pattern insights
- Gift discovery metrics
- Engagement tracking
- Source performance analysis

### Gift Explorer

- Browse thousands of curated gifts
- Advanced filtering by category, price, and tags
- Infinite scroll for seamless browsing
- Sort by popularity, price, or recency
- Trending gifts section
- Source badges for quick identification
- Hybrid suggestions combining AI and discovered gifts
- User feedback collection for improving suggestions

### Email Configuration

- Support for Gmail, Outlook, Yahoo, and custom SMTP
- Secure credential handling
- Test email functionality
- Customizable sender name
- Toggle for enabling/disabling email notifications

### Data Management

- Periodic export reminders for data backup
- Customizable reminder frequency
- Easy navigation to export functionality
- One-click export options

## 🧪 Development Workflow

### Code Conventions

- React functional components with hooks
- CSS modules for component styling
- Component organization by feature
- Context providers for global state
- Protected routes for authenticated content

### State Management

- **Authentication State**: Managed with AuthContext (cookie-based authentication)
- **Notification State**: Managed with NotificationContext
- **User Data**: Managed with Redux userSlice
- **Gift Library**: Managed with Redux giftLibrarySlice
- **Component-specific State**: Managed with useState and useEffect

### API Integration

- Centralized Axios instance with interceptors
- Configured with withCredentials for cookie-based auth
- Automatic token refresh mechanism
- Error handling for API requests
- Environment-specific API URLs

## 📦 Build and Deployment

### Build Process

1. Run the build command:
   ```bash
   npm run build
   ```

2. The optimized production build will be created in the `build` directory.

### Environment Configuration

For production deployment, set the proper environment variables:
- `REACT_APP_API_BASE_URL`: URL of the production API

### Deployment Considerations

- Ensure CORS is properly configured on the backend API
- Set up proper error monitoring and logging
- Configure proper cache headers for static assets
- Consider using a CDN for static content delivery
- Ensure access to required APIs (OpenAI, Brave Search)
- Monitor gift discovery system performance

## 🤝 Contributing

1. Follow the existing code structure and naming conventions
2. Write meaningful commit messages
3. Test your changes thoroughly
4. Update documentation as needed

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
