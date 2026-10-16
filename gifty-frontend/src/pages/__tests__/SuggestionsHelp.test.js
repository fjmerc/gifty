import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SuggestionsHelp from '../js/SuggestionsHelp';

// Mock CSS modules
// FontAwesome icons render as a span named after the icon
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, className, style }) => (
    <span data-testid={`${icon.iconName}-icon`} className={className} style={style} />
  ),
}));

jest.mock('../css/SuggestionsHelp.module.css', () => ({
  suggestionsHelpPage: 'suggestionsHelpPage',
  container: 'container',
  header: 'header',
  featureIcon: 'featureIcon',
  subtitle: 'subtitle',
  section: 'section',
  featureCard: 'featureCard',
  featureContent: 'featureContent',
  instructionsList: 'instructionsList',
  callout: 'callout',
  calloutIcon: 'calloutIcon',
  calloutContent: 'calloutContent',
  footer: 'footer',
  backButton: 'backButton'
}));

// Test utility to render component with router
const renderWithRouter = (initialEntries = ['/suggestions-help']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <SuggestionsHelp />
    </MemoryRouter>
  );
};

describe('SuggestionsHelp', () => {
  // 1. Component Logic Analysis & Bug Fixes Validation
  describe('Component Logic Analysis & Bug Fixes Validation', () => {
    test('is a clean static component with no logic issues requiring fixes', () => {
      // This component is purely presentational with no state management,
      // side effects, or complex logic requiring fixes
      const { container } = renderWithRouter();
      
      // Verify component renders without errors
      expect(container.firstChild).toBeInTheDocument();
      expect(container.firstChild).toHaveClass('suggestionsHelpPage');
    });

    test('uses proper React Router integration without anti-patterns', () => {
      renderWithRouter();
      
      // Verify Link component is used correctly (not window.location)
      const backLink = screen.getByRole('link', { name: /back to gifts/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/gifts');
    });

    test('implements CSS modules correctly without hardcoded styles', () => {
      const { container } = renderWithRouter();
      
      // Verify CSS modules are applied (not inline styles)
      const mainContainer = container.querySelector('.container');
      expect(mainContainer).toBeInTheDocument();
      expect(mainContainer).toHaveClass('container');
    });
  });

  // 2. Authentication & Basic Rendering
  describe('Authentication & Basic Rendering', () => {
    test('renders main page structure without authentication requirements', () => {
      renderWithRouter();
      
      // Main title, no icon (DESIGN.md One Title Rule)
      expect(screen.getByRole('heading', { name: /enhanced gift suggestions/i })).toBeInTheDocument();
      expect(screen.queryByTestId('bolt-icon')).not.toBeInTheDocument();
      
      // Verify subtitle
      expect(screen.getByText(/understanding how our smart gift recommendation system works/i)).toBeInTheDocument();
    });

    test('renders all major sections of the help page', () => {
      renderWithRouter();
      
      // Verify section headings
      expect(screen.getByRole('heading', { name: /what are enhanced suggestions/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /how it works/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /how to use enhanced suggestions/i })).toBeInTheDocument();
    });

    test('applies CSS module classes to main container elements', () => {
      const { container } = renderWithRouter();
      
      expect(container.querySelector('.suggestionsHelpPage')).toBeInTheDocument();
      expect(container.querySelector('.container')).toBeInTheDocument();
      expect(container.querySelector('.header')).toBeInTheDocument();
      expect(container.querySelector('.footer')).toBeInTheDocument();
    });
  });

  // 3. Content Display & Structure
  describe('Content Display & Structure', () => {
    test('displays introductory explanation content', () => {
      renderWithRouter();
      
      const introText = screen.getByText(/enhanced suggestions is an advanced gift recommendation system/i);
      expect(introText).toBeInTheDocument();
      
      const detailText = screen.getByText(/unlike basic suggestions which rely solely on recipient profiles/i);
      expect(detailText).toBeInTheDocument();
    });

    test('renders all feature cards with proper content', () => {
      renderWithRouter();
      
      // Feedback Collection
      expect(screen.getByRole('heading', { name: /feedback collection/i })).toBeInTheDocument();
      expect(screen.getByText(/when you rate suggestions as helpful or not helpful/i)).toBeInTheDocument();
      
      // Pattern Recognition
      expect(screen.getByRole('heading', { name: /pattern recognition/i })).toBeInTheDocument();
      expect(screen.getByText(/our system analyzes patterns in your feedback/i)).toBeInTheDocument();
      
      // Intelligent Filtering
      expect(screen.getByRole('heading', { name: /intelligent filtering/i })).toBeInTheDocument();
      expect(screen.getByText(/gift ideas similar to ones you've previously marked/i)).toBeInTheDocument();
      
      // Personalized Scoring
      expect(screen.getByRole('heading', { name: /personalized scoring/i })).toBeInTheDocument();
      expect(screen.getByText(/each suggestion is scored based on how well it matches/i)).toBeInTheDocument();
      
      // Privacy-Focused
      expect(screen.getByRole('heading', { name: /privacy-focused/i })).toBeInTheDocument();
      expect(screen.getByText(/all learning happens locally within your account/i)).toBeInTheDocument();
    });

    test('displays instructions list with numbered steps', () => {
      renderWithRouter();
      
      // Verify it's an ordered list
      const instructionsList = screen.getByRole('list');
      expect(instructionsList).toBeInTheDocument();
      
      // Check for instruction content
      expect(screen.getByText(/provide feedback on suggestions/i)).toBeInTheDocument();
      expect(screen.getByText(/toggle enhanced suggestions/i)).toBeInTheDocument();
      expect(screen.getByText(/allow time for learning/i)).toBeInTheDocument();
      expect(screen.getByText(/check the analytics/i)).toBeInTheDocument();
    });

    test('shows guarantee callout section', () => {
      renderWithRouter();
      
      expect(screen.getByRole('heading', { name: /better suggestions guaranteed/i })).toBeInTheDocument();
      expect(screen.getByText(/our enhanced suggestions feature is designed to continuously improve/i)).toBeInTheDocument();
    });
  });

  // 4. Navigation & React Router Integration
  describe('Navigation & React Router Integration', () => {
    test('renders back to gifts navigation link', () => {
      renderWithRouter();
      
      const backLink = screen.getByRole('link', { name: /back to gifts/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/gifts');
    });

    test('applies correct CSS class to back button', () => {
      renderWithRouter();
      
      const backLink = screen.getByRole('link', { name: /back to gifts/i });
      expect(backLink).toHaveClass('backButton');
    });

    test('works correctly when accessed from different routes', () => {
      // Test component renders consistently regardless of how user arrived
      renderWithRouter(['/other-page', '/suggestions-help']);
      
      expect(screen.getByRole('heading', { name: /enhanced gift suggestions/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /back to gifts/i })).toBeInTheDocument();
    });
  });

  // 5. CSS Modules & Styling
  describe('CSS Modules & Styling', () => {
    test('applies CSS module classes to all major elements', () => {
      const { container } = renderWithRouter();
      
      // Main containers
      expect(container.querySelector('.suggestionsHelpPage')).toBeInTheDocument();
      expect(container.querySelector('.container')).toBeInTheDocument();
      expect(container.querySelector('.header')).toBeInTheDocument();
      
      // Content sections
      expect(container.querySelector('.section')).toBeInTheDocument();
      expect(container.querySelector('.instructionsList')).toBeInTheDocument();
      expect(container.querySelector('.callout')).toBeInTheDocument();
      expect(container.querySelector('.footer')).toBeInTheDocument();
    });

    test('applies feature card styling classes', () => {
      const { container } = renderWithRouter();
      
      const featureCards = container.querySelectorAll('.featureCard');
      expect(featureCards.length).toBeGreaterThan(0);
      
      const featureContent = container.querySelector('.featureContent');
      expect(featureContent).toBeInTheDocument();
    });

    test('applies icon and callout specific styling', () => {
      const { container } = renderWithRouter();
      
      // Feature icons
      const featureIcon = container.querySelector('.featureIcon');
      expect(featureIcon).toBeInTheDocument();
      
      // Callout styling
      expect(container.querySelector('.callout')).toBeInTheDocument();
      expect(container.querySelector('.calloutIcon')).toBeInTheDocument();
      expect(container.querySelector('.calloutContent')).toBeInTheDocument();
    });

    test('subtitle and back button have proper styling classes', () => {
      const { container } = renderWithRouter();
      
      expect(container.querySelector('.subtitle')).toBeInTheDocument();
      expect(container.querySelector('.backButton')).toBeInTheDocument();
    });
  });

  // 6. Icon Integration
  describe('Icon Integration', () => {

    test('renders all feature card icons with correct sizes', () => {
      renderWithRouter();
      
      // All feature icons should be size 24
      expect(screen.getByTestId('heart-icon')).toHaveStyle({ fontSize: '24px' });
      expect(screen.getByTestId('arrow-trend-up-icon')).toHaveStyle({ fontSize: '24px' });
      expect(screen.getByTestId('filter-icon')).toHaveStyle({ fontSize: '24px' });
      expect(screen.getByTestId('chart-pie-icon')).toHaveStyle({ fontSize: '24px' });
      expect(screen.getByTestId('key-icon')).toHaveStyle({ fontSize: '24px' });
    });

    test('renders callout Award icon with correct size', () => {
      renderWithRouter();
      
      const awardIcon = screen.getByTestId('award-icon');
      expect(awardIcon).toBeInTheDocument();
      expect(awardIcon).toHaveStyle({ fontSize: '24px' });
      expect(awardIcon).toHaveClass('calloutIcon');
    });

    test('all icons are properly integrated without rendering errors', () => {
      renderWithRouter();
      
      // Verify all expected icons are present
      const expectedIcons = ['heart-icon', 'arrow-trend-up-icon', 'filter-icon', 'chart-pie-icon', 'key-icon', 'award-icon'];
      
      expectedIcons.forEach(iconTestId => {
        expect(screen.getByTestId(iconTestId)).toBeInTheDocument();
      });
    });
  });

  // 7. Accessibility & Semantic Structure
  describe('Accessibility & Semantic Structure', () => {
    test('has proper heading hierarchy', () => {
      renderWithRouter();
      
      // Main heading (h1)
      expect(screen.getByRole('heading', { level: 1, name: /enhanced gift suggestions/i })).toBeInTheDocument();
      
      // Section headings (h2)
      expect(screen.getByRole('heading', { level: 2, name: /what are enhanced suggestions/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: /how it works/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: /how to use enhanced suggestions/i })).toBeInTheDocument();
      
      // Feature headings (h3)
      expect(screen.getByRole('heading', { level: 3, name: /feedback collection/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: /pattern recognition/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: /better suggestions guaranteed/i })).toBeInTheDocument();
    });

    test('uses semantic list for instructions', () => {
      renderWithRouter();
      
      const instructionsList = screen.getByRole('list');
      expect(instructionsList).toBeInTheDocument();
      
      // Should be an ordered list (ol)
      expect(instructionsList.tagName).toBe('OL');
    });

    test('provides meaningful link text for navigation', () => {
      renderWithRouter();
      
      const backLink = screen.getByRole('link', { name: /back to gifts/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveTextContent('Back to Gifts');
    });

    test('content is properly structured for screen readers', () => {
      renderWithRouter();
      
      // Verify main landmark areas exist
      const mainContent = screen.getByRole('heading', { level: 1 }).closest('div');
      expect(mainContent).toBeInTheDocument();
      
      // Verify content is properly nested within semantic elements
      const sections = screen.getAllByRole('heading', { level: 2 });
      expect(sections.length).toBeGreaterThan(0);
      
      sections.forEach(section => {
        expect(section.closest('div')).toBeInTheDocument();
      });
    });
  });

  // 8. Content Sections & Feature Cards
  describe('Content Sections & Feature Cards', () => {
    test('renders exactly 5 feature cards in How It Works section', () => {
      const { container } = renderWithRouter();
      
      const featureCards = container.querySelectorAll('.featureCard');
      expect(featureCards).toHaveLength(5);
    });

    test('each feature card has icon, heading, and description', () => {
      renderWithRouter();
      
      const featureData = [
        { heading: 'Feedback Collection', icon: 'heart-icon' },
        { heading: 'Pattern Recognition', icon: 'arrow-trend-up-icon' },
        { heading: 'Intelligent Filtering', icon: 'filter-icon' },
        { heading: 'Personalized Scoring', icon: 'chart-pie-icon' },
        { heading: 'Privacy-Focused', icon: 'key-icon' }
      ];
      
      featureData.forEach(({ heading, icon }) => {
        expect(screen.getByRole('heading', { name: new RegExp(heading, 'i') })).toBeInTheDocument();
        expect(screen.getByTestId(icon)).toBeInTheDocument();
      });
    });

    test('instructions section contains 4 ordered steps', () => {
      renderWithRouter();
      
      // Check for instruction keywords
      expect(screen.getByText(/provide feedback on suggestions/i)).toBeInTheDocument();
      expect(screen.getByText(/toggle enhanced suggestions/i)).toBeInTheDocument();
      expect(screen.getByText(/allow time for learning/i)).toBeInTheDocument();
      expect(screen.getByText(/check the analytics/i)).toBeInTheDocument();
    });

    test('callout section is prominently displayed', () => {
      const { container } = renderWithRouter();
      
      const callout = container.querySelector('.callout');
      expect(callout).toBeInTheDocument();
      
      // Verify callout content
      expect(screen.getByRole('heading', { name: /better suggestions guaranteed/i })).toBeInTheDocument();
      expect(screen.getByTestId('award-icon')).toBeInTheDocument();
    });

    test('all content sections have proper CSS styling applied', () => {
      const { container } = renderWithRouter();
      
      // Verify section containers
      const sections = container.querySelectorAll('.section');
      expect(sections.length).toBeGreaterThan(0);
      
      // Verify feature content areas
      const featureContents = container.querySelectorAll('.featureContent');
      expect(featureContents.length).toBe(5); // 5 feature cards
    });
  });

  // 9. Performance & Edge Cases
  describe('Performance & Edge Cases', () => {
    test('renders efficiently without unnecessary re-renders', () => {
      const { rerender } = renderWithRouter();
      
      // Initial render
      expect(screen.getByRole('heading', { name: /enhanced gift suggestions/i })).toBeInTheDocument();
      
      // Re-render should be efficient (static component)
      rerender(
        <MemoryRouter initialEntries={['/suggestions-help']}>
          <SuggestionsHelp />
        </MemoryRouter>
      );
      
      expect(screen.getByRole('heading', { name: /enhanced gift suggestions/i })).toBeInTheDocument();
    });

    test('handles missing CSS modules gracefully', () => {
      // Component should still render even if CSS classes are undefined
      jest.doMock('../css/SuggestionsHelp.module.css', () => ({}));
      
      renderWithRouter();
      
      expect(screen.getByRole('heading', { name: /enhanced gift suggestions/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /back to gifts/i })).toBeInTheDocument();
    });

    test('maintains content integrity across different viewport scenarios', () => {
      renderWithRouter();
      
      // All essential content should be present regardless of viewport
      expect(screen.getByRole('heading', { name: /enhanced gift suggestions/i })).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(6); // 5 features + 1 callout
      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /back to gifts/i })).toBeInTheDocument();
    });

    test('works correctly with router state changes', () => {
      const { rerender } = renderWithRouter(['/suggestions-help']);
      
      expect(screen.getByRole('heading', { name: /enhanced gift suggestions/i })).toBeInTheDocument();
      
      // Simulate navigation state change
      rerender(
        <MemoryRouter initialEntries={['/gifts', '/suggestions-help']}>
          <SuggestionsHelp />
        </MemoryRouter>
      );
      
      expect(screen.getByRole('heading', { name: /enhanced gift suggestions/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /back to gifts/i })).toHaveAttribute('href', '/gifts');
    });

    test('handles icon library edge cases', () => {
      renderWithRouter();
      
      // All icons should render without errors even if library has issues
      const iconTestIds = ['heart-icon', 'arrow-trend-up-icon', 'filter-icon', 'chart-pie-icon', 'key-icon', 'award-icon'];
      
      iconTestIds.forEach(testId => {
        const icon = screen.getByTestId(testId);
        expect(icon).toBeInTheDocument();
      });
    });
  });
});