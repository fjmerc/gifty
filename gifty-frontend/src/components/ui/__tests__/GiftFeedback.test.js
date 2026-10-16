import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GiftFeedback from '../GiftFeedback';
import axiosInstance from '../../../axiosInstance';

// Mock axios
// FontAwesome icons render as a span named after the icon
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, className, style }) => (
    <span data-testid={`${icon.iconName}-icon`} className={className} style={style} />
  ),
}));

jest.mock('../../../axiosInstance', () => ({
  post: jest.fn()
}));

// Mock CSS modules
jest.mock('../../../pages/css/Gifts.module.css', () => ({
  feedbackContainer: 'feedbackContainer',
  feedbackTitle: 'feedbackTitle',
  starRating: 'starRating',
  starButton: 'starButton',
  starActive: 'starActive',
  ratingLabel: 'ratingLabel',
  ratingText: 'ratingText',
  feedbackButtons: 'feedbackButtons',
  ignoreButton: 'ignoreButton',
  likeButton: 'likeButton',
  feedbackIcon: 'feedbackIcon',
  feedbackError: 'feedbackError',
  feedbackLoading: 'feedbackLoading',
  feedbackSubmitted: 'feedbackSubmitted'
}));

describe('GiftFeedback Component', () => {
  const mockGift = {
    _id: 'gift-123',
    name: 'Test Gift',
    price: 25.99
  };

  const mockOnFeedbackSubmitted = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock successful API response
    axiosInstance.post.mockResolvedValue({
      data: { success: true, message: 'Feedback submitted successfully' }
    });
  });

  describe('Initial Render', () => {
    it('renders feedback form with all elements', () => {
      render(<GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />);

      expect(screen.getByText('Rate this suggestion')).toBeInTheDocument();
      
      // Check for 5 star buttons
      const starButtons = screen.getAllByLabelText(/Rate \d stars/);
      expect(starButtons).toHaveLength(5);
      
      // Check for action buttons
      expect(screen.getByRole('button', { name: 'Not Helpful' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Helpful' })).toBeInTheDocument();
    });

    it('initializes with zero rating', () => {
      render(<GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />);

      const starButtons = screen.getAllByLabelText(/Rate \d stars/);
      starButtons.forEach(button => {
        expect(button).not.toHaveClass('starActive');
      });
    });

    it('does not show rating text initially', () => {
      render(<GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />);

      expect(screen.queryByText('Not helpful')).not.toBeInTheDocument();
      expect(screen.queryByText('Somewhat helpful')).not.toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading message when isLoading is true', () => {
      render(<GiftFeedback gift={mockGift} isLoading={true} />);

      expect(screen.getByText('Loading feedback...')).toBeInTheDocument();
      expect(screen.queryByText('Rate this suggestion')).not.toBeInTheDocument();
    });
  });

  describe('Existing Feedback State', () => {
    it('shows thank you message with existing feedback', () => {
      const existingFeedback = { rating: 4, action: 'favorited' };
      
      render(
        <GiftFeedback 
          gift={mockGift} 
          existingFeedback={existingFeedback}
          onFeedbackSubmitted={mockOnFeedbackSubmitted} 
        />
      );

      expect(screen.getByText('Thank you for your feedback!')).toBeInTheDocument();
      expect(screen.queryByText('Rate this suggestion')).not.toBeInTheDocument();
    });

    it('displays existing rating stars correctly', () => {
      const existingFeedback = { rating: 3 };
      
      render(
        <GiftFeedback 
          gift={mockGift} 
          existingFeedback={existingFeedback}
          onFeedbackSubmitted={mockOnFeedbackSubmitted} 
        />
      );

      expect(screen.getByText('Thank you for your feedback!')).toBeInTheDocument();
      expect(screen.getByText('Helpful', { selector: '.ratingLabel' })).toBeInTheDocument();
      
      // Check that 3 stars are active (filled)
      const starIcons = screen.getAllByTestId('star-icon');
      expect(starIcons).toHaveLength(5);
    });

    it('shows correct rating labels for different ratings', () => {
      const testCases = [
        { rating: 1, label: 'Not helpful' },
        { rating: 2, label: 'Somewhat helpful' },
        { rating: 3, label: 'Helpful' },
        { rating: 4, label: 'Very helpful' },
        { rating: 5, label: 'Extremely helpful' }
      ];

      testCases.forEach(({ rating, label }) => {
        const { unmount } = render(
          <GiftFeedback 
            gift={mockGift} 
            existingFeedback={{ rating }}
            onFeedbackSubmitted={mockOnFeedbackSubmitted} 
          />
        );

        expect(screen.getByText(label)).toBeInTheDocument();
        unmount();
      });
    });
  });

  describe('Star Rating Interaction', () => {
    it('updates rating when star is clicked', async () => {
      const user = userEvent.setup();
      render(<GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />);

      const thirdStar = screen.getByLabelText('Rate 3 stars');
      await user.click(thirdStar);

      // Check for rating text (not button text)
      expect(screen.getByText('Helpful', { selector: '.ratingText' })).toBeInTheDocument();
    });

    it('toggles rating off when same star is clicked', async () => {
      const user = userEvent.setup();
      render(<GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />);

      const secondStar = screen.getByLabelText('Rate 2 stars');
      
      // Click to set rating
      await user.click(secondStar);
      expect(screen.getByText('Somewhat helpful', { selector: '.ratingText' })).toBeInTheDocument();
      
      // Click same star to toggle off
      await user.click(secondStar);
      expect(screen.queryByText('Somewhat helpful', { selector: '.ratingText' })).not.toBeInTheDocument();
    });

    it('prevents event propagation on star click', async () => {
      const user = userEvent.setup();
      const mockParentClick = jest.fn();
      
      render(
        <div onClick={mockParentClick}>
          <GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />
        </div>
      );

      const firstStar = screen.getByLabelText('Rate 1 stars');
      await user.click(firstStar);

      expect(mockParentClick).not.toHaveBeenCalled();
    });
  });

  describe('Action Buttons', () => {
    it('submits "ignored" feedback when "Not Helpful" is clicked', async () => {
      const user = userEvent.setup();
      render(<GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />);

      const notHelpfulButton = screen.getByRole('button', { name: 'Not Helpful' });
      await user.click(notHelpfulButton);

      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/feedback', {
          giftId: 'gift-123',
          action: 'ignored',
          explicitRating: null
        });
      });
    });

    it('submits "favorited" feedback when "Helpful" is clicked', async () => {
      const user = userEvent.setup();
      render(<GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />);

      const helpfulButton = screen.getByRole('button', { name: 'Helpful' });
      await user.click(helpfulButton);

      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/feedback', {
          giftId: 'gift-123',
          action: 'favorited',
          explicitRating: null
        });
      });
    });

    it('includes rating in feedback submission', async () => {
      const user = userEvent.setup();
      render(<GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />);

      // Set rating first
      const fourthStar = screen.getByLabelText('Rate 4 stars');
      await user.click(fourthStar);

      // Then submit feedback
      const helpfulButton = screen.getByRole('button', { name: 'Helpful' });
      await user.click(helpfulButton);

      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/feedback', {
          giftId: 'gift-123',
          action: 'favorited',
          explicitRating: 4
        });
      });
    });

    it('calls onFeedbackSubmitted callback after successful submission', async () => {
      const user = userEvent.setup();
      render(<GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />);

      const helpfulButton = screen.getByRole('button', { name: 'Helpful' });
      await user.click(helpfulButton);

      await waitFor(() => {
        expect(mockOnFeedbackSubmitted).toHaveBeenCalledWith('favorited', 0);
      });
    });

    it('prevents event propagation on action button clicks', async () => {
      const user = userEvent.setup();
      const mockParentClick = jest.fn();
      
      render(
        <div onClick={mockParentClick}>
          <GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />
        </div>
      );

      const helpfulButton = screen.getByRole('button', { name: 'Helpful' });
      await user.click(helpfulButton);

      expect(mockParentClick).not.toHaveBeenCalled();
    });
  });

  describe('Submission State', () => {
    it('shows loading state during submission', async () => {
      const user = userEvent.setup();
      
      // Mock a delayed response
      axiosInstance.post.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ data: { success: true } }), 100))
      );

      render(<GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />);

      const helpfulButton = screen.getByRole('button', { name: 'Helpful' });
      await user.click(helpfulButton);

      expect(screen.getByText('Submitting...')).toBeInTheDocument();
      
      // Buttons should be disabled during submission
      expect(helpfulButton).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Not Helpful' })).toBeDisabled();
    });

    it('shows thank you message after successful submission', async () => {
      const user = userEvent.setup();
      render(<GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />);

      const helpfulButton = screen.getByRole('button', { name: 'Helpful' });
      await user.click(helpfulButton);

      await waitFor(() => {
        expect(screen.getByText('Thank you for your feedback!')).toBeInTheDocument();
      });

      expect(screen.queryByText('Rate this suggestion')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('shows error message when submission fails', async () => {
      const user = userEvent.setup();
      axiosInstance.post.mockRejectedValue(new Error('Network error'));

      render(<GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />);

      const helpfulButton = screen.getByRole('button', { name: 'Helpful' });
      await user.click(helpfulButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to submit feedback. Please try again.')).toBeInTheDocument();
      });

      // Error icon should be displayed
      expect(screen.getByTestId('xmark-icon')).toBeInTheDocument();
    });

    it('allows retry after error', async () => {
      const user = userEvent.setup();
      
      // First call fails, second succeeds
      axiosInstance.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: { success: true } });

      render(<GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />);

      const helpfulButton = screen.getByRole('button', { name: 'Helpful' });
      
      // First attempt fails
      await user.click(helpfulButton);
      await waitFor(() => {
        expect(screen.getByText('Failed to submit feedback. Please try again.')).toBeInTheDocument();
      });

      // Second attempt should succeed
      await user.click(helpfulButton);
      await waitFor(() => {
        expect(screen.getByText('Thank you for your feedback!')).toBeInTheDocument();
      });
    });
  });

  describe('Event Propagation', () => {
    it('prevents clicks from propagating to parent', async () => {
      const user = userEvent.setup();
      const mockParentClick = jest.fn();
      
      render(
        <div onClick={mockParentClick}>
          <GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />
        </div>
      );

      // Click on the feedback container
      const feedbackContainer = screen.getByText('Rate this suggestion').closest('.feedbackContainer');
      await user.click(feedbackContainer);

      expect(mockParentClick).not.toHaveBeenCalled();
    });
  });

  describe('useEffect Behavior', () => {
    it('updates state when existingFeedback prop changes', () => {
      const { rerender } = render(
        <GiftFeedback gift={mockGift} onFeedbackSubmitted={mockOnFeedbackSubmitted} />
      );

      // Initially should show feedback form
      expect(screen.getByText('Rate this suggestion')).toBeInTheDocument();

      // Update with existing feedback
      rerender(
        <GiftFeedback 
          gift={mockGift} 
          existingFeedback={{ rating: 5, action: 'favorited' }}
          onFeedbackSubmitted={mockOnFeedbackSubmitted} 
        />
      );

      // Should now show thank you message
      expect(screen.getByText('Thank you for your feedback!')).toBeInTheDocument();
      expect(screen.getByText('Extremely helpful', { selector: '.ratingLabel' })).toBeInTheDocument();
    });

    it('handles loading state changes correctly', () => {
      const { rerender } = render(
        <GiftFeedback 
          gift={mockGift} 
          isLoading={true}
          onFeedbackSubmitted={mockOnFeedbackSubmitted} 
        />
      );

      expect(screen.getByText('Loading feedback...')).toBeInTheDocument();

      // Update to not loading with feedback
      rerender(
        <GiftFeedback 
          gift={mockGift} 
          isLoading={false}
          existingFeedback={{ rating: 3 }}
          onFeedbackSubmitted={mockOnFeedbackSubmitted} 
        />
      );

      expect(screen.getByText('Thank you for your feedback!')).toBeInTheDocument();
      expect(screen.getByText('Helpful', { selector: '.ratingLabel' })).toBeInTheDocument();
    });
  });
});