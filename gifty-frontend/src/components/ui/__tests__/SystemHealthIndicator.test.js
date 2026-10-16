import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SystemHealthIndicator from '../SystemHealthIndicator';
import axiosInstance from '../../../axiosInstance';

// Mock axios
jest.mock('../../../axiosInstance', () => ({
  get: jest.fn(),
  post: jest.fn()
}));

// Mock FontAwesome icons
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, spin, className, ...props }) => {
    const iconName = icon?.iconName || 'unknown';
    return (
      <svg 
        data-testid="fontawesome-icon" 
        data-icon={iconName}
        data-spin={spin}
        className={className}
        {...props}
      >
        <path d={`${iconName}-path`} />
      </svg>
    );
  }
}));

jest.mock('@fortawesome/free-solid-svg-icons', () => ({
  faCheckCircle: { iconName: 'check-circle' },
  faExclamationTriangle: { iconName: 'exclamation-triangle' },
  faInfoCircle: { iconName: 'info-circle' },
  faStethoscope: { iconName: 'stethoscope' },
  faSearch: { iconName: 'search' },
  faSpinner: { iconName: 'spinner' },
  faExclamationCircle: { iconName: 'exclamation-circle' }
}));

// Mock react-tooltip
jest.mock('react-tooltip', () => ({
  Tooltip: ({ id, ...props }) => <div data-testid={`tooltip-${id}`} {...props} />
}));

// Mock CSS modules
jest.mock('../SystemHealthIndicator.module.css', () => ({
  healthIndicator: 'healthIndicator',
  healthStatus: 'healthStatus',
  unknown: 'unknown',
  healthy: 'healthy',
  unhealthy: 'unhealthy',
  statusIcon: 'statusIcon',
  infoIcon: 'infoIcon',
  healthProgressContainer: 'healthProgressContainer',
  healthProgress: 'healthProgress',
  discoveryInfo: 'discoveryInfo',
  actionButtons: 'actionButtons',
  actionButton: 'actionButton',
  discoveryButton: 'discoveryButton',
  message: 'message',
  error: 'error',
  success: 'success',
  diagnosticReport: 'diagnosticReport',
  reportSection: 'reportSection'
}));

describe('SystemHealthIndicator Component', () => {
  const mockOnHealthUpdate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('No System Health Data', () => {
    it('renders unknown health state when no systemHealth provided', () => {
      render(<SystemHealthIndicator onHealthUpdate={mockOnHealthUpdate} />);

      expect(screen.getByText('System health unknown')).toBeInTheDocument();
      
      // Check the status icon specifically (first icon)
      const statusIcon = screen.getByText('System health unknown').parentElement.querySelector('[data-testid="fontawesome-icon"]');
      expect(statusIcon).toHaveAttribute('data-icon', 'info-circle');
      
      expect(screen.getByRole('button', { name: /Run Diagnostics/i })).toBeInTheDocument();
    });

    it('renders unknown health state when systemHealth is null', () => {
      render(<SystemHealthIndicator systemHealth={null} onHealthUpdate={mockOnHealthUpdate} />);

      expect(screen.getByText('System health unknown')).toBeInTheDocument();
      
      // Check the status icon specifically
      const statusIcon = screen.getByText('System health unknown').parentElement.querySelector('[data-testid="fontawesome-icon"]');
      expect(statusIcon).toHaveAttribute('data-icon', 'info-circle');
    });

    it('applies correct CSS classes for unknown state', () => {
      render(<SystemHealthIndicator onHealthUpdate={mockOnHealthUpdate} />);

      const healthStatus = screen.getByText('System health unknown').closest('.healthStatus');
      expect(healthStatus).toHaveClass('healthStatus', 'unknown');
    });
  });

  describe('Healthy System State', () => {
    const healthySystemHealth = {
      isHealthy: true,
      giftCount: 150,
      minLibrarySize: 100,
      lastDiscovery: '2025-01-06T10:00:00Z'
    };

    it('renders healthy state correctly', () => {
      render(<SystemHealthIndicator systemHealth={healthySystemHealth} onHealthUpdate={mockOnHealthUpdate} />);

      expect(screen.getByText('Hybrid system healthy')).toBeInTheDocument();
      
      // Check the status icon specifically
      const statusIcon = screen.getByText('Hybrid system healthy').parentElement.querySelector('[data-testid="fontawesome-icon"]');
      expect(statusIcon).toHaveAttribute('data-icon', 'check-circle');
    });

    it('applies correct CSS classes for healthy state', () => {
      render(<SystemHealthIndicator systemHealth={healthySystemHealth} onHealthUpdate={mockOnHealthUpdate} />);

      const healthStatus = screen.getByText('Hybrid system healthy').closest('.healthStatus');
      expect(healthStatus).toHaveClass('healthStatus', 'healthy');
    });

    it('shows 100% progress when gift count is above threshold', () => {
      render(<SystemHealthIndicator systemHealth={healthySystemHealth} onHealthUpdate={mockOnHealthUpdate} />);

      const progressBar = document.querySelector('.healthProgress');
      expect(progressBar).toHaveStyle({ width: '100%' });
    });

    it('displays last discovery information', () => {
      render(<SystemHealthIndicator systemHealth={healthySystemHealth} onHealthUpdate={mockOnHealthUpdate} />);

      expect(screen.getByText(/Last discovery:/)).toBeInTheDocument();
      expect(screen.getByText(/1\/6\/2025/)).toBeInTheDocument(); // Date formatting may vary
    });

    it('shows both diagnostics and discovery buttons for healthy system', () => {
      render(<SystemHealthIndicator systemHealth={healthySystemHealth} onHealthUpdate={mockOnHealthUpdate} />);

      expect(screen.getByRole('button', { name: /Run Diagnostics/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Trigger Discovery/i })).toBeInTheDocument();
    });

    it('displays tooltip information', () => {
      render(<SystemHealthIndicator systemHealth={healthySystemHealth} onHealthUpdate={mockOnHealthUpdate} />);

      const tooltipElement = screen.getByText('Hybrid system healthy').parentElement.querySelector('[data-tooltip-content]');
      expect(tooltipElement).toBeInTheDocument();
      expect(tooltipElement).toHaveAttribute('data-tooltip-content', 
        'The hybrid suggestion system requires more than 100 gifts in the library to function optimally. Currently at 100% capacity.');
    });
  });

  describe('Unhealthy System State', () => {
    const unhealthySystemHealth = {
      isHealthy: false,
      giftCount: 50,
      minLibrarySize: 100,
      lastDiscovery: '2025-01-05T10:00:00Z'
    };

    it('renders unhealthy state correctly', () => {
      render(<SystemHealthIndicator systemHealth={unhealthySystemHealth} onHealthUpdate={mockOnHealthUpdate} />);

      expect(screen.getByText('Hybrid system needs more data (50/100)')).toBeInTheDocument();
      
      // Check the status icon specifically
      const statusIcon = screen.getByText(/Hybrid system needs more data/).parentElement.querySelector('[data-testid="fontawesome-icon"]');
      expect(statusIcon).toHaveAttribute('data-icon', 'exclamation-triangle');
    });

    it('applies correct CSS classes for unhealthy state', () => {
      render(<SystemHealthIndicator systemHealth={unhealthySystemHealth} onHealthUpdate={mockOnHealthUpdate} />);

      const healthStatus = screen.getByText(/Hybrid system needs more data/).closest('.healthStatus');
      expect(healthStatus).toHaveClass('healthStatus', 'unhealthy');
    });

    it('shows correct progress percentage', () => {
      render(<SystemHealthIndicator systemHealth={unhealthySystemHealth} onHealthUpdate={mockOnHealthUpdate} />);

      const progressBar = document.querySelector('.healthProgress');
      expect(progressBar).toHaveStyle({ width: '50%' });
    });

    it('shows both diagnostics and discovery buttons for unhealthy system', () => {
      render(<SystemHealthIndicator systemHealth={unhealthySystemHealth} onHealthUpdate={mockOnHealthUpdate} />);

      expect(screen.getByRole('button', { name: /Run Diagnostics/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Trigger Discovery/i })).toBeInTheDocument();
    });

    it('displays correct tooltip for unhealthy system', () => {
      render(<SystemHealthIndicator systemHealth={unhealthySystemHealth} onHealthUpdate={mockOnHealthUpdate} />);

      const tooltipElement = screen.getByText(/Hybrid system needs more data/).parentElement.querySelector('[data-tooltip-content]');
      expect(tooltipElement).toHaveAttribute('data-tooltip-content', 
        'The hybrid suggestion system requires more than 100 gifts in the library to function optimally. Currently at 50% capacity.');
    });
  });

  describe('Run Diagnostics Functionality', () => {
    const mockDiagnosticResponse = {
      data: {
        systemHealth: {
          totalGifts: 85,
          recentGifts: 5,
          lastDiscovery: {
            discoveryDate: '2025-01-05T10:00:00Z'
          }
        }
      }
    };

    it('calls diagnostics API when button is clicked', async () => {
      axiosInstance.get.mockResolvedValue(mockDiagnosticResponse);

      render(<SystemHealthIndicator onHealthUpdate={mockOnHealthUpdate} />);

      const diagnosticsButton = screen.getByRole('button', { name: /Run Diagnostics/i });
      fireEvent.click(diagnosticsButton);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/gift-library/system-health');
      });
    });

    it('handles successful diagnostics response', async () => {
      axiosInstance.get.mockResolvedValue(mockDiagnosticResponse);

      render(<SystemHealthIndicator onHealthUpdate={mockOnHealthUpdate} />);

      const diagnosticsButton = screen.getByRole('button', { name: /Run Diagnostics/i });
      fireEvent.click(diagnosticsButton);

      // Wait for the API call to complete
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/gift-library/system-health');
      });
      
      // Verify the mock was called correctly
      expect(axiosInstance.get).toHaveBeenCalledTimes(1);
    });

    it('calls onHealthUpdate callback', async () => {
      axiosInstance.get.mockResolvedValue(mockDiagnosticResponse);

      render(<SystemHealthIndicator onHealthUpdate={mockOnHealthUpdate} />);

      const diagnosticsButton = screen.getByRole('button', { name: /Run Diagnostics/i });
      fireEvent.click(diagnosticsButton);

      await waitFor(() => {
        // The component forwards the system-health payload as-is
        expect(mockOnHealthUpdate).toHaveBeenCalledWith(mockDiagnosticResponse.data);
      });
    });
  });

  describe('Trigger Discovery Functionality', () => {
    const unhealthySystemHealth = { giftCount: 50 };
    const mockDiscoveryResponse = {
      data: { message: 'Discovery process started successfully' }
    };

    it('calls discovery API when button is clicked', async () => {
      axiosInstance.post.mockResolvedValue(mockDiscoveryResponse);
      axiosInstance.get.mockResolvedValue({ data: { systemHealth: {} } });

      render(<SystemHealthIndicator systemHealth={unhealthySystemHealth} onHealthUpdate={mockOnHealthUpdate} />);

      const discoveryButton = screen.getByRole('button', { name: /Trigger Discovery/i });
      fireEvent.click(discoveryButton);

      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/gift-library/discover/trigger');
      });
    });

    it('handles authorization error correctly', async () => {
      const authError = { response: { status: 403 } };
      axiosInstance.post.mockRejectedValue(authError);

      render(<SystemHealthIndicator systemHealth={unhealthySystemHealth} onHealthUpdate={mockOnHealthUpdate} />);

      const discoveryButton = screen.getByRole('button', { name: /Trigger Discovery/i });
      fireEvent.click(discoveryButton);

      await waitFor(() => {
        expect(screen.getByText('Not authorized. Admin privileges required.')).toBeInTheDocument();
      });
    });
  });

  describe('Progress Bar Calculations', () => {
    it('calculates progress percentage correctly for various gift counts', () => {
      const testCases = [
        { giftCount: 0, expected: '0%' },
        { giftCount: 25, expected: '25%' },
        { giftCount: 50, expected: '50%' },
        { giftCount: 75, expected: '75%' },
        { giftCount: 100, expected: '100%' },
        { giftCount: 150, expected: '100%' } // Capped at 100%
      ];

      testCases.forEach(({ giftCount, expected }) => {
        const { unmount } = render(<SystemHealthIndicator systemHealth={{ giftCount }} />);
        
        const progressBar = document.querySelector('.healthProgress');
        expect(progressBar).toHaveStyle({ width: expected });
        
        unmount();
      });
    });
  });

  describe('CSS Classes and Styling', () => {
    it('applies correct CSS classes to main container', () => {
      const { container } = render(<SystemHealthIndicator systemHealth={{ giftCount: 50 }} />);
      
      const healthIndicator = container.querySelector('.healthIndicator');
      expect(healthIndicator).toBeInTheDocument();
    });

    it('applies progress bar styling correctly', () => {
      render(<SystemHealthIndicator systemHealth={{ giftCount: 75 }} />);
      
      const progressContainer = document.querySelector('.healthProgressContainer');
      const progressBar = document.querySelector('.healthProgress');
      
      expect(progressContainer).toBeInTheDocument();
      expect(progressBar).toBeInTheDocument();
    });
  });

  describe('Tooltip Integration', () => {
    it('renders tooltip component', () => {
      render(<SystemHealthIndicator systemHealth={{ giftCount: 50 }} />);

      expect(screen.getByTestId('tooltip-system-health-info')).toBeInTheDocument();
    });
  });

  describe('Component Integration', () => {
    it('handles missing lastDiscovery gracefully', () => {
      const systemHealthWithoutDiscovery = { giftCount: 75 };
      
      render(<SystemHealthIndicator systemHealth={systemHealthWithoutDiscovery} />);

      expect(screen.queryByText(/Last discovery:/)).not.toBeInTheDocument();
    });

    it('handles component without onHealthUpdate callback', () => {
      // Should render without throwing error when callback is undefined
      expect(() => {
        render(<SystemHealthIndicator systemHealth={{ giftCount: 50 }} onHealthUpdate={undefined} />);
      }).not.toThrow();
      
      expect(screen.getByText(/Hybrid system needs more data/)).toBeInTheDocument();
    });
  });
});