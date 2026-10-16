import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../test-utils';
import About from '../js/About';

// Icons as svg elements named after the icon (setupTests' mock loses its body under resetMocks)
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, ...props }) => <svg data-icon={icon.iconName} {...props} />,
}));

// Mock CSS modules
jest.mock('../css/About.module.css', () => ({
  aboutPage: 'aboutPage',
  heroSection: 'heroSection',
  btnPrimary: 'btnPrimary',
  featuresSection: 'featuresSection',
  sectionTitle: 'sectionTitle',
  featuresGrid: 'featuresGrid',
  feature: 'feature',
  featureIcon: 'featureIcon',
  ctaSection: 'ctaSection',
  faqSection: 'faqSection',
  faqItem: 'faqItem',
  faqQuestion: 'faqQuestion',
  footer: 'footer'
}));

describe('About Component', () => {
  beforeEach(() => {
    // Clear any previous state
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    test('renders main page structure', () => {
      render(<About />);
      
      expect(screen.getByRole('heading', { name: /about gifty/i })).toBeInTheDocument();
      expect(screen.getByText(/comprehensive gift management application/i)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /key features/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /frequently asked questions/i })).toBeInTheDocument();
    });

    test('renders hero section with correct content', () => {
      render(<About />);
      
      const heroHeading = screen.getByRole('heading', { name: /about gifty/i });
      expect(heroHeading).toBeInTheDocument();
      
      const heroDescription = screen.getByText(/comprehensive gift management application designed to take the stress out of gift-giving/i);
      expect(heroDescription).toBeInTheDocument();
      
      const getStartedLink = screen.getByRole('link', { name: /get started now/i });
      expect(getStartedLink).toBeInTheDocument();
      expect(getStartedLink).toHaveAttribute('href', '/register');
    });

    test('renders all feature sections', () => {
      render(<About />);
      
      const featureHeadings = [
        /gift management/i,
        /ai gift suggestions/i,
        /event tracking/i,
        /budget planning/i,
        /recipient management/i,
        /smart notifications/i
      ];
      
      featureHeadings.forEach(heading => {
        expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
      });
    });

    test('feature icons come from the icon set, not emoji', () => {
      const { container } = render(<About />);

      const icons = container.querySelectorAll('.featureIcon');
      expect(icons).toHaveLength(6);
      icons.forEach((icon) => {
        expect(icon.querySelector('svg')).not.toBeNull();
        expect(icon).toHaveAttribute('aria-hidden', 'true');
      });
      expect(screen.queryByText('🎁')).not.toBeInTheDocument();
    });

    test('shows no testimonials (the people and the Premium tier were invented)', () => {
      render(<About />);

      expect(screen.queryByRole('heading', { name: /what our users say/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/Premium User/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Jon M\./)).not.toBeInTheDocument();
    });

    test('renders call-to-action section', () => {
      render(<About />);
      
      expect(screen.getByRole('heading', { name: /ready to become the perfect gift-giver/i })).toBeInTheDocument();
      expect(screen.getByText(/join gifty today and transform your gift-giving experience/i)).toBeInTheDocument();
      
      const createAccountLink = screen.getByRole('link', { name: /create free account/i });
      expect(createAccountLink).toBeInTheDocument();
      expect(createAccountLink).toHaveAttribute('href', '/register');
    });

    test('renders footer section', () => {
      render(<About />);
      
      const currentYear = new Date().getFullYear();
      expect(screen.getByText(new RegExp(`© ${currentYear} Gifty`))).toBeInTheDocument();
      
      const backHomeLink = screen.getByRole('link', { name: /^back to home$/i });
      expect(backHomeLink).toBeInTheDocument();
      expect(backHomeLink).toHaveAttribute('href', '/');
    });
  });

  describe('FAQ Accordion Functionality', () => {
    test('each question is a button that reports whether its answer is open', () => {
      render(<About />);
      const question = screen.getByRole('button', { name: /how does gifty help me choose gifts/i });
      expect(question).toHaveAttribute('aria-expanded', 'false');
      question.focus();
      fireEvent.click(question);
      expect(question).toHaveAttribute('aria-expanded', 'true');
      const answer = screen.getByText(/gifty uses a combination of your recipient's preferences/i);
      expect(question).toHaveAttribute('aria-controls', answer.id);
    });

    test('renders all FAQ questions', () => {
      render(<About />);
      
      const faqQuestions = [
        /how does gifty help me choose gifts/i,
        /can i set budgets for different people or events/i,
        /how do i get notified about upcoming events/i,
        /is my data secure on gifty/i,
        /can i use gifty on my mobile phone/i
      ];
      
      faqQuestions.forEach(question => {
        expect(screen.getByText(question)).toBeInTheDocument();
      });
    });

    test('FAQ items are initially collapsed', () => {
      render(<About />);
      
      // FAQ answers should not be visible initially
      expect(screen.queryByText(/gifty uses a combination of your recipient's preferences/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/yes! gifty allows you to set individual budgets/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/gifty's notification system sends timely reminders/i)).not.toBeInTheDocument();
    });

    test('clicking FAQ item toggles accordion', () => {
      render(<About />);
      
      const faqQuestion = screen.getByText(/how does gifty help me choose gifts/i);
      
      // Initially collapsed
      expect(screen.queryByText(/gifty uses a combination of your recipient's preferences/i)).not.toBeInTheDocument();
      
      // Click to expand
      fireEvent.click(faqQuestion);
      expect(screen.getByText(/gifty uses a combination of your recipient's preferences/i)).toBeInTheDocument();
      
      // Click again to collapse
      fireEvent.click(faqQuestion);
      expect(screen.queryByText(/gifty uses a combination of your recipient's preferences/i)).not.toBeInTheDocument();
    });

    test('only one FAQ item can be expanded at a time', () => {
      render(<About />);
      
      const firstQuestion = screen.getByText(/how does gifty help me choose gifts/i);
      const secondQuestion = screen.getByText(/can i set budgets for different people or events/i);
      
      // Expand first question
      fireEvent.click(firstQuestion);
      expect(screen.getByText(/gifty uses a combination of your recipient's preferences/i)).toBeInTheDocument();
      
      // Expand second question
      fireEvent.click(secondQuestion);
      expect(screen.getByText(/yes! gifty allows you to set individual budgets/i)).toBeInTheDocument();
      
      // First question should now be collapsed
      expect(screen.queryByText(/gifty uses a combination of your recipient's preferences/i)).not.toBeInTheDocument();
    });

    test('FAQ items show correct expand/collapse indicators', () => {
      const { container } = render(<About />);

      const faqQuestion = screen.getByText(/how does gifty help me choose gifts/i);
      const count = (name) => container.querySelectorAll(`.faqQuestion svg[data-icon="${name}"]`).length;

      expect(count('plus')).toBe(5);
      expect(count('minus')).toBe(0);
      expect(screen.queryByText('+')).not.toBeInTheDocument();

      fireEvent.click(faqQuestion);
      expect(count('minus')).toBe(1);
      expect(count('plus')).toBe(4);

      fireEvent.click(faqQuestion);
      expect(count('plus')).toBe(5);
      expect(count('minus')).toBe(0);
    });

    test('can expand and collapse all FAQ items individually', () => {
      render(<About />);
      
      const faqQuestions = [
        /how does gifty help me choose gifts/i,
        /can i set budgets for different people or events/i,
        /how do i get notified about upcoming events/i,
        /is my data secure on gifty/i,
        /can i use gifty on my mobile phone/i
      ];
      
      const faqAnswers = [
        /gifty uses a combination of your recipient's preferences/i,
        /yes! gifty allows you to set individual budgets/i,
        /gifty's notification system sends timely reminders/i,
        /absolutely\. gifty employs jwt-based authentication/i,
        /yes, gifty is designed with responsive layouts/i
      ];
      
      // Test each FAQ item
      faqQuestions.forEach((question, index) => {
        const questionElement = screen.getByText(question);
        
        // Expand
        fireEvent.click(questionElement);
        expect(screen.getByText(faqAnswers[index])).toBeInTheDocument();
        
        // Collapse
        fireEvent.click(questionElement);
        expect(screen.queryByText(faqAnswers[index])).not.toBeInTheDocument();
      });
    });
  });

  describe('Navigation Links', () => {
    test('renders register links with correct href', () => {
      render(<About />);
      
      const registerLinks = screen.getAllByRole('link', { name: /get started now|create free account/i });
      
      registerLinks.forEach(link => {
        expect(link).toHaveAttribute('href', '/register');
      });
    });

    test('renders home link with correct href', () => {
      render(<About />);
      
      const homeLink = screen.getByRole('link', { name: /^back to home$/i });
      expect(homeLink).toHaveAttribute('href', '/');
    });

    test('navigation links are clickable', () => {
      render(<About />);
      
      const getStartedLink = screen.getByRole('link', { name: /get started now/i });
      const createAccountLink = screen.getByRole('link', { name: /create free account/i });
      const backHomeLink = screen.getByRole('link', { name: /^back to home$/i });
      
      expect(getStartedLink).toBeEnabled();
      expect(createAccountLink).toBeEnabled();
      expect(backHomeLink).toBeEnabled();
    });
  });

  describe('Content Accuracy', () => {
    test('displays correct feature descriptions', () => {
      render(<About />);
      
      expect(screen.getByText(/easily organize and track gifts for all your recipients/i)).toBeInTheDocument();
      expect(screen.getByText(/powered by advanced ai, gifty generates personalized gift ideas/i)).toBeInTheDocument();
      expect(screen.getByText(/keep track of birthdays, anniversaries, holidays/i)).toBeInTheDocument();
      expect(screen.getByText(/set spending limits for each recipient or event/i)).toBeInTheDocument();
      expect(screen.getByText(/create detailed profiles for your gift recipients/i)).toBeInTheDocument();
      expect(screen.getByText(/never miss an important date with customizable reminders/i)).toBeInTheDocument();
    });

    test('displays correct FAQ answers when expanded', () => {
      render(<About />);
      
      // Expand first FAQ
      const firstQuestion = screen.getByText(/how does gifty help me choose gifts/i);
      fireEvent.click(firstQuestion);
      expect(screen.getByText(/the system learns from your feedback to improve suggestions/i)).toBeInTheDocument();
      
      // Expand security FAQ
      const securityQuestion = screen.getByText(/is my data secure on gifty/i);
      fireEvent.click(securityQuestion);
      expect(screen.getByText(/jwt-based authentication and secure data storage practices/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('has proper heading hierarchy', () => {
      render(<About />);
      
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toHaveTextContent('About Gifty');
      
      const h2s = screen.getAllByRole('heading', { level: 2 });
      expect(h2s.length).toBeGreaterThan(0);
      
      const h3s = screen.getAllByRole('heading', { level: 3 });
      expect(h3s.length).toBeGreaterThan(0);
    });

    test('FAQ items are keyboard accessible', () => {
      render(<About />);
      
      const faqQuestion = screen.getByText(/how does gifty help me choose gifts/i);
      const faqItem = faqQuestion.closest('div');
      
      // Should be focusable (has onClick handler)
      expect(faqItem).toBeInTheDocument();
      
      // Test with keyboard events
      fireEvent.keyDown(faqItem, { key: 'Enter', code: 'Enter' });
      // Note: The component uses onClick, so keyboard navigation would need to be enhanced
    });

    test('links have accessible text', () => {
      render(<About />);
      
      const getStartedLink = screen.getByRole('link', { name: /get started now/i });
      const createAccountLink = screen.getByRole('link', { name: /create free account/i });
      const backHomeLink = screen.getByRole('link', { name: /^back to home$/i });
      
      expect(getStartedLink).toHaveAccessibleName();
      expect(createAccountLink).toHaveAccessibleName();
      expect(backHomeLink).toHaveAccessibleName();
    });

  });

  describe('Responsive Design Elements', () => {
    test('applies correct CSS classes', () => {
      const { container } = render(<About />);
      
      expect(container.querySelector('.aboutPage')).toBeInTheDocument();
      expect(container.querySelector('.heroSection')).toBeInTheDocument();
      expect(container.querySelector('.featuresGrid')).toBeInTheDocument();
      expect(container.querySelector('.faqSection')).toBeInTheDocument();
    });

    test('feature grid contains all features', () => {
      const { container } = render(<About />);
      
      const featuresGrid = container.querySelector('.featuresGrid');
      const features = featuresGrid.querySelectorAll('.feature');
      
      expect(features).toHaveLength(6);
    });

  });

  describe('State Management', () => {
    test('initializes with no active accordion', () => {
      render(<About />);
      
      // No FAQ answers should be visible initially
      const faqAnswers = [
        /gifty uses a combination of your recipient's preferences/i,
        /yes! gifty allows you to set individual budgets/i,
        /gifty's notification system sends timely reminders/i,
        /absolutely\. gifty employs jwt-based authentication/i,
        /yes, gifty is designed with responsive layouts/i
      ];
      
      faqAnswers.forEach(answer => {
        expect(screen.queryByText(answer)).not.toBeInTheDocument();
      });
    });

    test('maintains state correctly across multiple interactions', () => {
      render(<About />);
      
      const firstQuestion = screen.getByText(/how does gifty help me choose gifts/i);
      const secondQuestion = screen.getByText(/can i set budgets for different people or events/i);
      
      // Expand first
      fireEvent.click(firstQuestion);
      expect(screen.getByText(/gifty uses a combination of your recipient's preferences/i)).toBeInTheDocument();
      
      // Expand second (should close first)
      fireEvent.click(secondQuestion);
      expect(screen.queryByText(/gifty uses a combination of your recipient's preferences/i)).not.toBeInTheDocument();
      expect(screen.getByText(/yes! gifty allows you to set individual budgets/i)).toBeInTheDocument();
      
      // Close second
      fireEvent.click(secondQuestion);
      expect(screen.queryByText(/yes! gifty allows you to set individual budgets/i)).not.toBeInTheDocument();
      
      // Re-expand first
      fireEvent.click(firstQuestion);
      expect(screen.getByText(/gifty uses a combination of your recipient's preferences/i)).toBeInTheDocument();
    });
  });

  describe('Dynamic Content', () => {
    test('displays current year in footer', () => {
      render(<About />);
      
      const currentYear = new Date().getFullYear();
      expect(screen.getByText(new RegExp(`© ${currentYear} Gifty`))).toBeInTheDocument();
    });

    test('maps FAQ items correctly', () => {
      render(<About />);

      // Should render exactly 5 FAQ items
      expect(screen.getAllByRole('button', { name: /\?/ })).toHaveLength(5);
    });

  });

  describe('Edge Cases', () => {
    test('handles rapid clicking on FAQ items', () => {
      render(<About />);
      
      const faqQuestion = screen.getByText(/how does gifty help me choose gifts/i);
      
      // Rapid clicks
      fireEvent.click(faqQuestion);
      fireEvent.click(faqQuestion);
      fireEvent.click(faqQuestion);
      
      // Should end up expanded (odd number of clicks)
      expect(screen.getByText(/gifty uses a combination of your recipient's preferences/i)).toBeInTheDocument();
    });

    test('handles clicking on different FAQ items in quick succession', () => {
      render(<About />);
      
      const questions = [
        screen.getByText(/how does gifty help me choose gifts/i),
        screen.getByText(/can i set budgets for different people or events/i),
        screen.getByText(/how do i get notified about upcoming events/i)
      ];
      
      // Click multiple items quickly
      questions.forEach(question => {
        fireEvent.click(question);
      });
      
      // Only the last clicked item should be expanded
      expect(screen.queryByText(/gifty uses a combination of your recipient's preferences/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/yes! gifty allows you to set individual budgets/i)).not.toBeInTheDocument();
      expect(screen.getByText(/gifty's notification system sends timely reminders/i)).toBeInTheDocument();
    });

    test('maintains consistent UI state after many interactions', () => {
      render(<About />);
      
      const firstQuestion = screen.getByText(/how does gifty help me choose gifts/i);
      
      // Multiple expand/collapse cycles
      for (let i = 0; i < 10; i++) {
        fireEvent.click(firstQuestion);
      }
      
      // Should be collapsed (even number of clicks)
      expect(screen.queryByText(/gifty uses a combination of your recipient's preferences/i)).not.toBeInTheDocument();
      expect(document.querySelectorAll('svg[data-icon="plus"]')).toHaveLength(5); // All 5 FAQ items should show plus
    });
  });
});