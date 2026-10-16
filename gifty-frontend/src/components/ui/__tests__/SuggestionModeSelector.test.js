import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuggestionModeSelector from '../SuggestionModeSelector';

// Mock FontAwesome icons
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, className, ...props }) => {
    const iconName = icon?.iconName || 'unknown';
    return (
      <svg
        data-testid="fontawesome-icon"
        data-icon={iconName}
        className={className}
        {...props}
      >
        <path d={`${iconName}-path`} />
      </svg>
    );
  }
}));

jest.mock('@fortawesome/free-solid-svg-icons', () => ({
  faRobot: { iconName: 'robot' },
  faGlobe: { iconName: 'globe' },
  faWandMagicSparkles: { iconName: 'wand-magic-sparkles' },
  faLayerGroup: { iconName: 'layer-group' },
  faExclamationTriangle: { iconName: 'exclamation-triangle' }
}));

// Mock CSS modules
jest.mock('../SuggestionModeSelector.module.css', () => ({
  container: 'container',
  title: 'title',
  modeGrid: 'modeGrid',
  modeOption: 'modeOption',
  selected: 'selected',
  modeIcon: 'modeIcon',
  modeLabel: 'modeLabel',
  modeWarningIcon: 'modeWarningIcon',
  detailPanel: 'detailPanel',
  modeDescription: 'modeDescription',
  modeDetails: 'modeDetails',
  modeMeta: 'modeMeta',
  warning: 'warning'
}));

describe('SuggestionModeSelector Component', () => {
  const mockOnModeChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders component with title and all four mode options', () => {
      render(<SuggestionModeSelector selectedMode="basic" onModeChange={mockOnModeChange} />);

      expect(screen.getByText('Suggestion Mode')).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /basic ai/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /enhanced ai/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /web-enhanced/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /hybrid mode/i })).toBeInTheDocument();
    });

    it('renders modes as a radiogroup', () => {
      render(<SuggestionModeSelector selectedMode="basic" onModeChange={mockOnModeChange} />);

      expect(screen.getByRole('radiogroup', { name: /suggestion mode/i })).toBeInTheDocument();
      expect(screen.getAllByRole('radio')).toHaveLength(4);
    });

    it('renders distinct icons for each mode', () => {
      render(<SuggestionModeSelector selectedMode="basic" onModeChange={mockOnModeChange} />);

      const icons = screen.getAllByTestId('fontawesome-icon').map(icon => icon.getAttribute('data-icon'));
      expect(icons).toContain('robot');
      expect(icons).toContain('wand-magic-sparkles');
      expect(icons).toContain('globe');
      expect(icons).toContain('layer-group');
    });
  });

  describe('Mode Selection', () => {
    it('marks the selected mode as checked', () => {
      render(<SuggestionModeSelector selectedMode="web" onModeChange={mockOnModeChange} />);

      expect(screen.getByRole('radio', { name: /web-enhanced/i })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: /basic ai/i })).toHaveAttribute('aria-checked', 'false');
    });

    it('applies the selected CSS class to the selected mode only', () => {
      render(<SuggestionModeSelector selectedMode="web" onModeChange={mockOnModeChange} />);

      expect(screen.getByRole('radio', { name: /web-enhanced/i })).toHaveClass('selected');
      expect(screen.getByRole('radio', { name: /basic ai/i })).not.toHaveClass('selected');
    });

    it('calls onModeChange when a mode is clicked', async () => {
      const user = userEvent.setup();
      render(<SuggestionModeSelector selectedMode="basic" onModeChange={mockOnModeChange} />);

      await user.click(screen.getByRole('radio', { name: /web-enhanced/i }));

      expect(mockOnModeChange).toHaveBeenCalledWith('web');
      expect(mockOnModeChange).toHaveBeenCalledTimes(1);
    });

    it('handles mode selection for every mode', async () => {
      const user = userEvent.setup();
      render(
        <SuggestionModeSelector
          selectedMode="basic"
          onModeChange={mockOnModeChange}
          interactionCount={15}
          systemHealth={{ isHealthy: true, giftCount: 150, minLibrarySize: 100 }}
        />
      );

      const modes = [
        { name: /basic ai/i, id: 'basic' },
        { name: /enhanced ai/i, id: 'enhanced' },
        { name: /web-enhanced/i, id: 'web' },
        { name: /hybrid mode/i, id: 'hybrid' }
      ];

      for (const mode of modes) {
        await user.click(screen.getByRole('radio', { name: mode.name }));
        expect(mockOnModeChange).toHaveBeenCalledWith(mode.id);
      }

      expect(mockOnModeChange).toHaveBeenCalledTimes(4);
    });

    it('is keyboard operable', async () => {
      const user = userEvent.setup();
      render(<SuggestionModeSelector selectedMode="basic" onModeChange={mockOnModeChange} />);

      const enhanced = screen.getByRole('radio', { name: /enhanced ai/i });
      enhanced.focus();
      await user.keyboard('{Enter}');

      expect(mockOnModeChange).toHaveBeenCalledWith('enhanced');
    });
  });

  describe('Detail Panel', () => {
    it('shows description and details for the selected mode only', () => {
      render(<SuggestionModeSelector selectedMode="basic" onModeChange={mockOnModeChange} />);

      expect(screen.getByText('Fast, AI-powered suggestions based on recipient preferences')).toBeInTheDocument();
      expect(screen.getByText('Instant results using our core AI')).toBeInTheDocument();
      // Other modes' descriptions are not rendered
      expect(screen.queryByText('AI suggestions checked against a web search')).not.toBeInTheDocument();
    });

    it('shows speed and accuracy for the selected mode', () => {
      render(<SuggestionModeSelector selectedMode="basic" onModeChange={mockOnModeChange} />);

      expect(screen.getByText(/speed:/i).parentElement).toHaveTextContent('Fastest');
      expect(screen.getByText(/accuracy:/i).parentElement).toHaveTextContent('Good');
    });

    it('updates the panel when the selected mode changes', () => {
      const { rerender } = render(
        <SuggestionModeSelector selectedMode="basic" onModeChange={mockOnModeChange} />
      );

      expect(screen.getByText('Instant results using our core AI')).toBeInTheDocument();

      rerender(<SuggestionModeSelector selectedMode="web" onModeChange={mockOnModeChange} />);

      expect(screen.queryByText('Instant results using our core AI')).not.toBeInTheDocument();
      expect(screen.getByText('With links to related pages it found. Prices are AI estimates.')).toBeInTheDocument();
    });

    it('promises no web prices, availability or reviews, and no "Best" accuracy for Web-Enhanced', () => {
      render(<SuggestionModeSelector selectedMode="web" onModeChange={mockOnModeChange} />);

      expect(screen.queryByText(/prices, availability|reviews|real-time/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Best/)).not.toBeInTheDocument();
      expect(screen.getByText(/Moderate/)).toBeInTheDocument();
    });

    it('renders no panel when selectedMode is undefined', () => {
      render(<SuggestionModeSelector selectedMode={undefined} onModeChange={mockOnModeChange} />);

      expect(screen.queryByText(/speed:/i)).not.toBeInTheDocument();
      screen.getAllByRole('radio').forEach(option => {
        expect(option).toHaveAttribute('aria-checked', 'false');
      });
    });
  });

  describe('Enhanced AI Mode', () => {
    // Enhanced AI is always available — the prompt and re-ranker
    // gracefully degrade when there's no feedback history, so gating
    // new users out of the better mode hurt UX.

    it('shows a tip about rating gifts when feedback is limited', () => {
      render(
        <SuggestionModeSelector
          selectedMode="enhanced"
          onModeChange={mockOnModeChange}
          interactionCount={1}
        />
      );

      expect(screen.getByText(/gets even better as you rate gifts/i)).toBeInTheDocument();
    });

    it('shows the standard description when feedback is sufficient', () => {
      render(
        <SuggestionModeSelector
          selectedMode="enhanced"
          onModeChange={mockOnModeChange}
          interactionCount={15}
        />
      );

      expect(screen.queryByText(/gets even better as you rate gifts/i)).not.toBeInTheDocument();
      expect(screen.getByText(/using your interaction history/i)).toBeInTheDocument();
    });

    it('is clickable without prior interactions', async () => {
      const user = userEvent.setup();
      render(
        <SuggestionModeSelector
          selectedMode="basic"
          onModeChange={mockOnModeChange}
          interactionCount={0}
        />
      );

      await user.click(screen.getByRole('radio', { name: /enhanced ai/i }));
      expect(mockOnModeChange).toHaveBeenCalledWith('enhanced');
    });
  });

  describe('Hybrid Mode System Health', () => {
    it('shows a warning icon on the hybrid option when the library is small', () => {
      render(
        <SuggestionModeSelector
          selectedMode="basic"
          onModeChange={mockOnModeChange}
          systemHealth={{ isHealthy: false, giftCount: 50, minLibrarySize: 100 }}
        />
      );

      const hybrid = screen.getByRole('radio', { name: /hybrid mode/i });
      expect(hybrid.querySelector('[data-icon="exclamation-triangle"]')).toBeInTheDocument();
    });

    it('hides the warning icon when the library is healthy', () => {
      render(
        <SuggestionModeSelector
          selectedMode="basic"
          onModeChange={mockOnModeChange}
          systemHealth={{ isHealthy: true, giftCount: 150, minLibrarySize: 100 }}
        />
      );

      const hybrid = screen.getByRole('radio', { name: /hybrid mode/i });
      expect(hybrid.querySelector('[data-icon="exclamation-triangle"]')).not.toBeInTheDocument();
    });

    it('shows warning in the panel when hybrid is selected with insufficient gifts', () => {
      render(
        <SuggestionModeSelector
          selectedMode="hybrid"
          onModeChange={mockOnModeChange}
          systemHealth={{ isHealthy: false, giftCount: 75, minLibrarySize: 100 }}
        />
      );

      expect(screen.getByText('Limited mode: Only 75/100 gifts in library')).toBeInTheDocument();
    });

    it('hides warning when hybrid is selected with sufficient gifts', () => {
      render(
        <SuggestionModeSelector
          selectedMode="hybrid"
          onModeChange={mockOnModeChange}
          systemHealth={{ isHealthy: true, giftCount: 120, minLibrarySize: 100 }}
        />
      );

      expect(screen.queryByText(/Limited mode:/)).not.toBeInTheDocument();
    });

    it('shows no Limited-mode warning while system health is unknown (null)', () => {
      render(
        <SuggestionModeSelector
          selectedMode="hybrid"
          onModeChange={mockOnModeChange}
          systemHealth={null}
        />
      );

      expect(screen.queryByText(/Limited mode:/)).not.toBeInTheDocument();
    });

    it('hybrid stays clickable even when the library is small', async () => {
      const user = userEvent.setup();
      render(
        <SuggestionModeSelector
          selectedMode="basic"
          onModeChange={mockOnModeChange}
          systemHealth={{ isHealthy: false, giftCount: 10, minLibrarySize: 100 }}
        />
      );

      await user.click(screen.getByRole('radio', { name: /hybrid mode/i }));
      expect(mockOnModeChange).toHaveBeenCalledWith('hybrid');
    });
  });

  describe('Prop Validation and Edge Cases', () => {
    it('handles missing props gracefully', () => {
      expect(() => {
        render(<SuggestionModeSelector />);
      }).not.toThrow();
    });

    it('handles undefined system health', () => {
      render(
        <SuggestionModeSelector
          selectedMode="hybrid"
          onModeChange={mockOnModeChange}
          systemHealth={undefined}
        />
      );

      expect(screen.queryByText(/Limited mode:/)).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('maintains semantic hierarchy with headings', () => {
      render(<SuggestionModeSelector selectedMode="basic" onModeChange={mockOnModeChange} />);

      const title = screen.getByText('Suggestion Mode');
      expect(title.tagName).toBe('H3');
    });

    it('mode options are real buttons', () => {
      render(<SuggestionModeSelector selectedMode="basic" onModeChange={mockOnModeChange} />);

      screen.getAllByRole('radio').forEach(option => {
        expect(option.tagName).toBe('BUTTON');
        expect(option).toHaveAttribute('type', 'button');
      });
    });
  });
});
