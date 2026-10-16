// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock axios
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({ data: {} })),
      post: jest.fn(() => Promise.resolve({ data: {} })),
      put: jest.fn(() => Promise.resolve({ data: {} })),
      delete: jest.fn(() => Promise.resolve({ data: {} })),
      patch: jest.fn(() => Promise.resolve({ data: {} })),
      interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
      },
    })),
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    put: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.sessionStorage = sessionStorageMock;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
  root: null,
  rootMargin: '',
  thresholds: [],
}));

// Mock Chart.js
jest.mock('chart.js', () => ({
  Chart: {
    register: jest.fn(),
    defaults: {
      plugins: {
        legend: {
          display: true,
        },
      },
    },
  },
  CategoryScale: jest.fn(),
  LinearScale: jest.fn(),
  BarElement: jest.fn(),
  LineElement: jest.fn(),
  PointElement: jest.fn(),
  ArcElement: jest.fn(),
  Title: jest.fn(),
  Tooltip: jest.fn(),
  Legend: jest.fn(),
  Filler: jest.fn(),
  registerables: [],
}));

// Mock react-chartjs-2
jest.mock('react-chartjs-2', () => ({
  Line: jest.fn(({ data, options }) => <div data-testid="line-chart" data-chart-data={JSON.stringify(data)} data-chart-options={JSON.stringify(options)} />),
  Bar: jest.fn(({ data, options }) => <div data-testid="bar-chart" data-chart-data={JSON.stringify(data)} data-chart-options={JSON.stringify(options)} />),
  Pie: jest.fn(({ data, options }) => <div data-testid="pie-chart" data-chart-data={JSON.stringify(data)} data-chart-options={JSON.stringify(options)} />),
  Doughnut: jest.fn(({ data, options }) => <div data-testid="doughnut-chart" data-chart-data={JSON.stringify(data)} data-chart-options={JSON.stringify(options)} />),
}));

// Mock FullCalendar
jest.mock('@fullcalendar/react', () => {
  return {
    __esModule: true,
    default: jest.fn(({ events, plugins, headerToolbar, ...props }) => (
      <div 
        data-testid="full-calendar" 
        data-events={JSON.stringify(events)}
        data-plugins={JSON.stringify(plugins)}
        data-header-toolbar={JSON.stringify(headerToolbar)}
        {...props}
      />
    )),
  };
});

jest.mock('@fullcalendar/daygrid', () => ({
  __esModule: true,
  default: 'dayGridPlugin',
}));

jest.mock('@fullcalendar/interaction', () => ({
  __esModule: true,
  default: 'interactionPlugin',
}));

// Mock FontAwesome icons
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: jest.fn(({ icon, ...props }) => (
    <i data-testid="font-awesome-icon" data-icon={icon} {...props} />
  )),
}));

// Mock React Datepicker
jest.mock('react-datepicker', () => {
  const MockDatePicker = jest.fn(({ onChange, selected, ...props }) => (
    <input
      data-testid="react-datepicker"
      type="date"
      value={selected ? selected.toISOString().split('T')[0] : ''}
      onChange={(e) => onChange && onChange(new Date(e.target.value))}
      {...props}
    />
  ));
  return {
    __esModule: true,
    default: MockDatePicker,
  };
});

// Mock React Toastify
jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
  ToastContainer: jest.fn(() => <div data-testid="toast-container" />),
}));

// Mock Tippy.js
jest.mock('tippy.js', () => ({
  default: jest.fn(() => ({
    destroy: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    setContent: jest.fn(),
  })),
}));

// Mock React Tooltip
jest.mock('react-tooltip', () => ({
  Tooltip: jest.fn(({ children, content, ...props }) => (
    <div data-testid="react-tooltip" data-content={content} {...props}>
      {children}
    </div>
  )),
}));

// Mock DOMPurify
jest.mock('dompurify', () => ({
  sanitize: jest.fn((dirty) => dirty),
}));

// Mock React Infinite Scroll
jest.mock('react-infinite-scroll-component', () => {
  return {
    __esModule: true,
    default: jest.fn(({ children, hasMore, loader, ...props }) => (
      <div data-testid="infinite-scroll" data-has-more={hasMore} {...props}>
        {children}
        {hasMore && loader}
      </div>
    )),
  };
});

// Mock Web Vitals
jest.mock('web-vitals', () => ({
  getCLS: jest.fn(),
  getFID: jest.fn(),
  getFCP: jest.fn(),
  getLCP: jest.fn(),
  getTTFB: jest.fn(),
}));

// Mock notification sound
jest.mock('./assets/sounds/notification.js', () => ({
  createNotificationSound: jest.fn(() => ({
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn(),
    currentTime: 0,
    duration: 1,
  })),
}));

// Mock window.Notification
global.Notification = jest.fn().mockImplementation((title, options) => ({
  title,
  options,
  close: jest.fn(),
}));
global.Notification.permission = 'default';
global.Notification.requestPermission = jest.fn().mockResolvedValue('granted');

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-object-url');
global.URL.revokeObjectURL = jest.fn();

// Suppress console warnings for tests
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeEach(() => {
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});
