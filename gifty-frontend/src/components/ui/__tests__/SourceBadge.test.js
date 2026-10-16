import React from 'react';
import { render, screen } from '@testing-library/react';
import SourceBadge from '../SourceBadge';

// Mock FontAwesome icons
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, className, ...props }) => (
    <svg 
      data-testid="fontawesome-icon" 
      data-icon={icon.iconName}
      className={className}
      {...props}
    >
      <path d={`${icon.iconName}-path`} />
    </svg>
  )
}));

jest.mock('@fortawesome/free-solid-svg-icons', () => ({
  faGlobe: { iconName: 'globe' },
  faRobot: { iconName: 'robot' }
}));

// Mock CSS modules
jest.mock('../SourceBadge.module.css', () => ({
  badge: 'badge',
  discovered: 'discovered',
  aiGenerated: 'aiGenerated',
  icon: 'icon'
}));

describe('SourceBadge Component', () => {
  describe('Web Discovery Badge', () => {
    it('renders discovered source badge correctly', () => {
      render(<SourceBadge sourceType="discovered" />);

      // Check for badge container
      const badge = screen.getByText('Web Discovery').closest('div');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('badge', 'discovered');

      // Check for text content
      expect(screen.getByText('Web Discovery')).toBeInTheDocument();

      // Check for FontAwesome globe icon
      const icon = screen.getByTestId('fontawesome-icon');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('data-icon', 'globe');
      expect(icon).toHaveClass('icon');
    });

    it('applies correct CSS classes for discovered type', () => {
      render(<SourceBadge sourceType="discovered" />);

      const badge = screen.getByText('Web Discovery').closest('div');
      expect(badge).toHaveClass('badge');
      expect(badge).toHaveClass('discovered');
      expect(badge).not.toHaveClass('aiGenerated');
    });

    it('renders with correct structure for discovered type', () => {
      const { container } = render(<SourceBadge sourceType="discovered" />);

      const badge = container.querySelector('.badge.discovered');
      expect(badge).toBeInTheDocument();

      // Should contain icon and span
      const icon = badge.querySelector('[data-testid="fontawesome-icon"]');
      const span = badge.querySelector('span');
      
      expect(icon).toBeInTheDocument();
      expect(span).toBeInTheDocument();
      expect(span).toHaveTextContent('Web Discovery');
    });
  });

  describe('AI Generated Badge', () => {
    it('renders AI generated source badge correctly', () => {
      render(<SourceBadge sourceType="ai_generated" />);

      // Check for badge container
      const badge = screen.getByText('AI Generated').closest('div');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('badge', 'aiGenerated');

      // Check for text content
      expect(screen.getByText('AI Generated')).toBeInTheDocument();

      // Check for FontAwesome robot icon
      const icon = screen.getByTestId('fontawesome-icon');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('data-icon', 'robot');
      expect(icon).toHaveClass('icon');
    });

    it('applies correct CSS classes for AI generated type', () => {
      render(<SourceBadge sourceType="ai_generated" />);

      const badge = screen.getByText('AI Generated').closest('div');
      expect(badge).toHaveClass('badge');
      expect(badge).toHaveClass('aiGenerated');
      expect(badge).not.toHaveClass('discovered');
    });

    it('renders with correct structure for AI generated type', () => {
      const { container } = render(<SourceBadge sourceType="ai_generated" />);

      const badge = container.querySelector('.badge.aiGenerated');
      expect(badge).toBeInTheDocument();

      // Should contain icon and span
      const icon = badge.querySelector('[data-testid="fontawesome-icon"]');
      const span = badge.querySelector('span');
      
      expect(icon).toBeInTheDocument();
      expect(span).toBeInTheDocument();
      expect(span).toHaveTextContent('AI Generated');
    });
  });

  describe('No Source Type', () => {
    it('renders nothing when sourceType is null', () => {
      const { container } = render(<SourceBadge sourceType={null} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when sourceType is undefined', () => {
      const { container } = render(<SourceBadge sourceType={undefined} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when sourceType is empty string', () => {
      const { container } = render(<SourceBadge sourceType="" />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when no sourceType prop is provided', () => {
      const { container } = render(<SourceBadge />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Invalid Source Type', () => {
    it('renders nothing for unknown sourceType values', () => {
      const { container } = render(<SourceBadge sourceType="unknown" />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing for invalid sourceType values', () => {
      const testCases = ['invalid', 'web', 'ai', 'manual', 'other'];
      
      testCases.forEach(sourceType => {
        const { container, unmount } = render(<SourceBadge sourceType={sourceType} />);
        expect(container.firstChild).toBeNull();
        unmount();
      });
    });
  });

  describe('Component Props and Attributes', () => {
    it('does not pass through additional props to root element', () => {
      render(<SourceBadge sourceType="discovered" data-testid="custom-badge" id="test-id" />);
      
      const badge = screen.getByText('Web Discovery').closest('div');
      expect(badge).not.toHaveAttribute('data-testid', 'custom-badge');
      expect(badge).not.toHaveAttribute('id', 'test-id');
    });

    it('maintains consistent structure regardless of sourceType', () => {
      const { container: discoveredContainer } = render(<SourceBadge sourceType="discovered" />);
      const { container: aiContainer } = render(<SourceBadge sourceType="ai_generated" />);

      const discoveredBadge = discoveredContainer.querySelector('.badge');
      const aiBadge = aiContainer.querySelector('.badge');

      // Both should have same element structure
      expect(discoveredBadge.children).toHaveLength(2); // icon + span
      expect(aiBadge.children).toHaveLength(2); // icon + span

      expect(discoveredBadge.querySelector('[data-testid="fontawesome-icon"]')).toBeInTheDocument();
      expect(discoveredBadge.querySelector('span')).toBeInTheDocument();
      
      expect(aiBadge.querySelector('[data-testid="fontawesome-icon"]')).toBeInTheDocument();
      expect(aiBadge.querySelector('span')).toBeInTheDocument();
    });
  });

  describe('Icon Verification', () => {
    it('uses correct icon for each source type', () => {
      // Test discovered source
      const { unmount: unmountDiscovered } = render(<SourceBadge sourceType="discovered" />);
      const discoveredIcon = screen.getByTestId('fontawesome-icon');
      expect(discoveredIcon).toHaveAttribute('data-icon', 'globe');
      unmountDiscovered();

      // Test AI generated source
      render(<SourceBadge sourceType="ai_generated" />);
      const aiIcon = screen.getByTestId('fontawesome-icon');
      expect(aiIcon).toHaveAttribute('data-icon', 'robot');
    });

    it('applies icon CSS class correctly', () => {
      render(<SourceBadge sourceType="discovered" />);
      
      const icon = screen.getByTestId('fontawesome-icon');
      expect(icon).toHaveClass('icon');
    });
  });

  describe('Text Content', () => {
    it('displays correct text for each source type', () => {
      // Test discovered source text
      const { unmount: unmountDiscovered } = render(<SourceBadge sourceType="discovered" />);
      expect(screen.getByText('Web Discovery')).toBeInTheDocument();
      expect(screen.queryByText('AI Generated')).not.toBeInTheDocument();
      unmountDiscovered();

      // Test AI generated source text
      render(<SourceBadge sourceType="ai_generated" />);
      expect(screen.getByText('AI Generated')).toBeInTheDocument();
      expect(screen.queryByText('Web Discovery')).not.toBeInTheDocument();
    });

    it('wraps text in span element', () => {
      render(<SourceBadge sourceType="discovered" />);
      
      const textSpan = screen.getByText('Web Discovery');
      expect(textSpan.tagName).toBe('SPAN');
    });
  });

  describe('Accessibility', () => {
    it('provides meaningful content for screen readers', () => {
      render(<SourceBadge sourceType="discovered" />);
      
      // Text content should be accessible
      expect(screen.getByText('Web Discovery')).toBeInTheDocument();
      
      // Icon should have appropriate attributes (handled by FontAwesome)
      const icon = screen.getByTestId('fontawesome-icon');
      expect(icon).toBeInTheDocument();
    });

    it('maintains semantic structure', () => {
      const { container } = render(<SourceBadge sourceType="ai_generated" />);
      
      const badge = container.querySelector('.badge');
      expect(badge.tagName).toBe('DIV');
      
      const textElement = badge.querySelector('span');
      expect(textElement).toBeInTheDocument();
    });
  });
});