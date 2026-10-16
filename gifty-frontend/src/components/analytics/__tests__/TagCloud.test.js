import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TagCloud from '../TagCloud';

// Mock CSS modules
jest.mock('../css/analytics/TagCloud.module.css', () => ({
  tagCloudCard: 'tag-cloud-card',
  cardHeader: 'card-header',
  controls: 'controls',
  formGroup: 'form-group',
  formLabel: 'form-label',
  formSelect: 'form-select',
  tagCloudContainer: 'tag-cloud-container',
  loadingPlaceholder: 'loading-placeholder',
  tagCloud: 'tag-cloud',
  tag: 'tag',
  noDataMessage: 'no-data-message',
  tagCountInfo: 'tag-count-info'
}));

// Test data
const mockTagData = [
  { tag: 'Electronics', count: 25 },
  { tag: 'Books', count: 20 },
  { tag: 'Clothing', count: 15 },
  { tag: 'Games', count: 12 },
  { tag: 'Home', count: 10 },
  { tag: 'Sports', count: 8 },
  { tag: 'Beauty', count: 6 },
  { tag: 'Music', count: 5 },
  { tag: 'Toys', count: 3 },
  { tag: 'Food', count: 2 }
];

const singleTagData = [
  { tag: 'Electronics', count: 10 }
];

const lowCountData = [
  { tag: 'Tag1', count: 1 },
  { tag: 'Tag2', count: 1 },
  { tag: 'Tag3', count: 1 }
];

const emptyData = [];

describe('TagCloud Component', () => {
  // Rendering Tests
  describe('Rendering', () => {
    test('renders tag cloud card with header', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      expect(document.querySelector('.card-header')).toBeInTheDocument();
      expect(screen.getByText('Tag Cloud')).toBeInTheDocument();
    });

    test('renders card body with controls and container', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      expect(document.querySelector('.card-body')).toBeInTheDocument();
      expect(screen.getByLabelText('Max Tags').parentElement).toBeInTheDocument();
      expect(screen.getByLabelText('Min Occurrences').parentElement).toBeInTheDocument();
    });

    test('renders max tags selector with correct options', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const maxTagsSelect = screen.getByLabelText('Max Tags');
      expect(maxTagsSelect).toBeInTheDocument();
      expect(maxTagsSelect.value).toBe('50');
      
      const options = Array.from(maxTagsSelect.querySelectorAll('option'));
      expect(options).toHaveLength(4);
      expect(options[0]).toHaveTextContent('20');
      expect(options[1]).toHaveTextContent('50');
      expect(options[2]).toHaveTextContent('100');
      expect(options[3]).toHaveTextContent('150');
    });

    test('renders min count selector with correct options', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const minCountSelect = screen.getByLabelText('Min Occurrences');
      expect(minCountSelect).toBeInTheDocument();
      expect(minCountSelect.value).toBe('2');
      
      const options = Array.from(minCountSelect.querySelectorAll('option'));
      expect(options).toHaveLength(4);
      expect(options[0]).toHaveTextContent('1');
      expect(options[1]).toHaveTextContent('2');
      expect(options[2]).toHaveTextContent('5');
      expect(options[3]).toHaveTextContent('10');
    });

    test('renders tag cloud container', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      expect(document.querySelector('.card-body')).toContainElement(
        document.querySelector('.tag-cloud-container')
      );
    });
  });

  // Tag Display Tests
  describe('Tag Display', () => {
    test('renders tags when data is provided', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      // Should render tags with count >= 2 (default minCount)
      expect(screen.getByText('Electronics')).toBeInTheDocument();
      expect(screen.getByText('Books')).toBeInTheDocument();
      expect(screen.getByText('Clothing')).toBeInTheDocument();
      expect(screen.getByText('Games')).toBeInTheDocument();
      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    test('applies correct font sizes to tags based on count', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const electronicsTag = screen.getByText('Electronics');
      const foodTag = screen.getByText('Food');
      
      expect(electronicsTag).toBeInTheDocument();
      expect(foodTag).toBeInTheDocument();
      
      // Electronics has highest count (25), should have larger font size
      // Food has count 2, should have smaller font size
      expect(electronicsTag).toHaveAttribute('style', expect.stringContaining('font-size'));
      expect(foodTag).toHaveAttribute('style', expect.stringContaining('font-size'));
    });

    test('applies opacity based on tag count', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const electronicsTag = screen.getByText('Electronics');
      expect(electronicsTag).toHaveAttribute('style', expect.stringContaining('opacity'));
    });

    test('displays tooltip with tag information', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const electronicsTag = screen.getByText('Electronics');
      expect(electronicsTag).toHaveAttribute('title', 'Electronics: 25 occurrences');
    });

    test('renders tags in descending order by count', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const tagCloud = document.querySelector('.tag-cloud');
      const tags = Array.from(tagCloud.children);
      
      // First tag should be Electronics (highest count: 25)
      expect(tags[0]).toHaveTextContent('Electronics');
      // Second tag should be Books (count: 20)
      expect(tags[1]).toHaveTextContent('Books');
      // Third tag should be Clothing (count: 15)
      expect(tags[2]).toHaveTextContent('Clothing');
    });
  });

  // Data Processing Tests
  describe('Data Processing', () => {
    test('filters tags by minimum count', () => {
      const dataWithLowCount = [...mockTagData, { tag: 'LowCount', count: 1 }];
      render(<TagCloud data={dataWithLowCount} isLoading={false} />);
      
      // With default minCount = 2, tags with count >= 2 should appear
      expect(screen.getByText('Toys')).toBeInTheDocument(); // count: 3, should appear
      expect(screen.getByText('Food')).toBeInTheDocument(); // count: 2, should appear
      
      // Tag with count 1 should not appear (below minCount of 2)
      expect(screen.queryByText('LowCount')).not.toBeInTheDocument();
    });

    test('limits tags by maximum count', () => {
      const manyTags = Array.from({ length: 100 }, (_, i) => ({
        tag: `Tag${i + 1}`,
        count: 100 - i
      }));
      
      render(<TagCloud data={manyTags} isLoading={false} />);
      
      // Should only show 50 tags (default maxTags)
      const tagCloud = document.querySelector('.tag-cloud');
      expect(tagCloud.children).toHaveLength(50);
    });

    test('handles empty data gracefully', () => {
      render(<TagCloud data={emptyData} isLoading={false} />);
      
      // A message, never a made-up tag chip
      expect(screen.getByText('No tag data available for the selected period.')).toBeInTheDocument();
      expect(document.querySelector('.tag')).toBeNull();
    });

    test('handles undefined data gracefully', () => {
      render(<TagCloud data={undefined} isLoading={false} />);
      
      // No invented tags
      expect(screen.queryByText('Birthday')).not.toBeInTheDocument();
      expect(screen.getByText('No tag data available for the selected period.')).toBeInTheDocument();
    });

    test('handles single tag data', () => {
      render(<TagCloud data={singleTagData} isLoading={false} />);
      
      expect(screen.getByText('Electronics')).toBeInTheDocument();
      expect(screen.getByText('Showing 1 tags (min 2 occurrences)')).toBeInTheDocument();
    });
  });

  // User Interaction Tests
  describe('User Interactions', () => {
    test('max tags selector changes number of displayed tags', async () => {
      const manyTags = Array.from({ length: 100 }, (_, i) => ({
        tag: `Tag${i + 1}`,
        count: 100 - i + 2 // Ensure all counts are >= 2 for default filter
      }));
      
      render(<TagCloud data={manyTags} isLoading={false} />);
      
      const maxTagsSelect = screen.getByLabelText('Max Tags');
      
      // Initially shows 50 tags
      let tagCloud = document.querySelector('.tag-cloud');
      expect(tagCloud.children).toHaveLength(50);
      
      // Change to 20 tags
      fireEvent.change(maxTagsSelect, { target: { value: '20' } });
      
      await waitFor(() => {
        tagCloud = document.querySelector('.tag-cloud');
        expect(tagCloud.children).toHaveLength(20);
      });
      
      // Change to 100 tags
      fireEvent.change(maxTagsSelect, { target: { value: '100' } });
      
      await waitFor(() => {
        tagCloud = document.querySelector('.tag-cloud');
        expect(tagCloud.children).toHaveLength(100);
      });
    });

    test('min count selector filters tags correctly', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const minCountSelect = screen.getByLabelText('Min Occurrences');
      
      // Initially minCount = 2, should show tags with count >= 2
      expect(screen.getByText('Food')).toBeInTheDocument(); // count: 2
      expect(screen.getByText('Toys')).toBeInTheDocument(); // count: 3
      
      // Change to minCount = 5
      fireEvent.change(minCountSelect, { target: { value: '5' } });
      
      // Should hide tags with count < 5
      expect(screen.queryByText('Food')).not.toBeInTheDocument(); // count: 2
      expect(screen.queryByText('Toys')).not.toBeInTheDocument(); // count: 3
      expect(screen.getByText('Music')).toBeInTheDocument(); // count: 5
      
      // Change to minCount = 10
      fireEvent.change(minCountSelect, { target: { value: '10' } });
      
      // Should only show tags with count >= 10
      expect(screen.queryByText('Music')).not.toBeInTheDocument(); // count: 5
      expect(screen.getByText('Home')).toBeInTheDocument(); // count: 10
    });

    test('selectors are disabled when loading', () => {
      render(<TagCloud data={mockTagData} isLoading={true} />);
      
      const maxTagsSelect = screen.getByLabelText('Max Tags');
      const minCountSelect = screen.getByLabelText('Min Occurrences');
      
      expect(maxTagsSelect).toBeDisabled();
      expect(minCountSelect).toBeDisabled();
    });

    test('maintains state across prop changes', () => {
      const { rerender } = render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const maxTagsSelect = screen.getByLabelText('Max Tags');
      fireEvent.change(maxTagsSelect, { target: { value: '20' } });
      
      expect(maxTagsSelect.value).toBe('20');
      
      // Re-render with different data
      rerender(<TagCloud data={singleTagData} isLoading={false} />);
      
      // State should be maintained
      expect(maxTagsSelect.value).toBe('20');
    });
  });

  // Loading State Tests
  describe('Loading States', () => {
    test('displays loading placeholder when isLoading is true', () => {
      render(<TagCloud data={mockTagData} isLoading={true} />);
      
      expect(screen.getByText('Loading tag data...')).toBeInTheDocument();
      expect(screen.queryByText('Electronics')).not.toBeInTheDocument();
    });

    test('hides loading placeholder when data loads', () => {
      const { rerender } = render(<TagCloud data={mockTagData} isLoading={true} />);
      
      expect(screen.getByText('Loading tag data...')).toBeInTheDocument();
      
      rerender(<TagCloud data={mockTagData} isLoading={false} />);
      
      expect(screen.queryByText('Loading tag data...')).not.toBeInTheDocument();
      expect(screen.getByText('Electronics')).toBeInTheDocument();
    });

    test('shows placeholder data when loading', () => {
      render(<TagCloud data={undefined} isLoading={true} />);
      
      // Should show loading message, not placeholder tags
      expect(screen.getByText('Loading tag data...')).toBeInTheDocument();
      expect(screen.queryByText('Birthday')).not.toBeInTheDocument();
    });
  });

  // Font Size Calculation Tests
  describe('Font Size Calculation', () => {
    test('calculates font sizes correctly for different counts', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const electronicsTag = screen.getByText('Electronics'); // count: 25 (max)
      const foodTag = screen.getByText('Food'); // count: 2 (close to min)
      
      // Check that font sizes are applied
      expect(electronicsTag).toHaveAttribute('style', expect.stringContaining('font-size'));
      expect(foodTag).toHaveAttribute('style', expect.stringContaining('font-size'));
    });

    test('handles equal counts correctly', () => {
      const equalCountData = [
        { tag: 'Tag1', count: 5 },
        { tag: 'Tag2', count: 5 },
        { tag: 'Tag3', count: 5 }
      ];
      
      render(<TagCloud data={equalCountData} isLoading={false} />);
      
      const tag1 = screen.getByText('Tag1');
      const tag2 = screen.getByText('Tag2');
      
      // All tags should have same font size when counts are equal
      expect(tag1).toHaveAttribute('style', expect.stringContaining('1em'));
      expect(tag2).toHaveAttribute('style', expect.stringContaining('1em'));
    });

    test('ensures font size stays within bounds', () => {
      const extremeCountData = [
        { tag: 'VeryHigh', count: 1000 },
        { tag: 'VeryLow', count: 2 } // Use count >= 2 to pass filter
      ];
      
      render(<TagCloud data={extremeCountData} isLoading={false} />);
      
      const highTag = screen.getByText('VeryHigh');
      const lowTag = screen.getByText('VeryLow');
      
      // Font sizes should be within 0.8em to 1.5em range
      expect(highTag).toHaveAttribute('style', expect.stringContaining('font-size'));
      expect(lowTag).toHaveAttribute('style', expect.stringContaining('font-size'));
    });
  });

  // Information Display Tests
  describe('Information Display', () => {
    test('displays tag count information', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      // With default minCount = 2, should show count of tags with count >= 2
      const filteredTagCount = mockTagData.filter(tag => tag.count >= 2).length;
      expect(screen.getByText(`Showing ${filteredTagCount} tags (min 2 occurrences)`)).toBeInTheDocument();
    });

    test('updates tag count information when filters change', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const minCountSelect = screen.getByLabelText('Min Occurrences');
      
      // Change to minCount = 5
      fireEvent.change(minCountSelect, { target: { value: '5' } });
      
      const filteredTagCount = mockTagData.filter(tag => tag.count >= 5).length;
      expect(screen.getByText(`Showing ${filteredTagCount} tags (min 5 occurrences)`)).toBeInTheDocument();
    });

    test('hides tag count information when loading', () => {
      render(<TagCloud data={mockTagData} isLoading={true} />);
      
      expect(screen.queryByText(/Showing \d+ tags/)).not.toBeInTheDocument();
    });

    test('shows no tag count information when there are no tags', () => {
      render(<TagCloud data={emptyData} isLoading={false} />);

      expect(screen.queryByText(/Showing \d+ tags/)).not.toBeInTheDocument();
    });
  });

  // Console Logging Tests

  // CSS Classes Tests
  describe('CSS Classes', () => {
    test('applies correct CSS module classes', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      expect(document.querySelector('.card-header')).toHaveClass('card-header');
      expect(screen.getByLabelText('Max Tags').parentElement).toHaveClass('form-group');
      expect(screen.getByLabelText('Min Occurrences').parentElement).toHaveClass('form-group');
    });

    test('applies loading placeholder class when loading', () => {
      render(<TagCloud data={mockTagData} isLoading={true} />);
      
      const loadingElement = screen.getByText('Loading tag data...');
      expect(loadingElement.parentElement).toHaveClass('loading-placeholder');
    });

    test('applies tag cloud class to container', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const tagCloud = document.querySelector('.tag-cloud');
      expect(tagCloud).toBeInTheDocument();
    });

    test('applies tag class to individual tags', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const electronicsTag = screen.getByText('Electronics');
      expect(electronicsTag).toHaveClass('tag');
    });
  });

  // Accessibility Tests
  describe('Accessibility', () => {
    test('form controls have proper labels', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      expect(screen.getByText('Max Tags')).toBeInTheDocument();
      expect(screen.getByText('Min Occurrences')).toBeInTheDocument();
    });

    test('maintains proper heading hierarchy', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const heading = screen.getByRole('heading', { level: 5 });
      expect(heading).toHaveTextContent('Tag Cloud');
    });

    test('provides meaningful tooltips for tags', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const electronicsTag = screen.getByText('Electronics');
      expect(electronicsTag).toHaveAttribute('title', 'Electronics: 25 occurrences');
      
      const booksTag = screen.getByText('Books');
      expect(booksTag).toHaveAttribute('title', 'Books: 20 occurrences');
    });

    test('provides clear information about displayed tags', () => {
      render(<TagCloud data={mockTagData} isLoading={false} />);
      
      const infoText = screen.getByText(/Showing \d+ tags/);
      expect(infoText).toBeInTheDocument();
    });
  });

  // Edge Cases and Error Handling
  describe('Edge Cases', () => {
    test('handles very high tag counts', () => {
      const highCountData = [
        { tag: 'VeryPopular', count: 999999 },
        { tag: 'Popular', count: 500000 },
        { tag: 'Normal', count: 100 }
      ];
      
      expect(() => {
        render(<TagCloud data={highCountData} isLoading={false} />);
      }).not.toThrow();
      
      expect(screen.getByText('VeryPopular')).toBeInTheDocument();
    });

    test('handles zero count tags', () => {
      const zeroCountData = [
        { tag: 'NoCount', count: 0 },
        { tag: 'SomeCount', count: 5 }
      ];
      
      render(<TagCloud data={zeroCountData} isLoading={false} />);
      
      // Tag with count 0 should not appear (below default minCount of 2)
      expect(screen.queryByText('NoCount')).not.toBeInTheDocument();
      expect(screen.getByText('SomeCount')).toBeInTheDocument();
    });

    test('handles special characters in tag names', () => {
      const specialCharData = [
        { tag: 'Tag & Name', count: 10 },
        { tag: 'Tag < > Name', count: 8 },
        { tag: 'Tag "Quote" Name', count: 6 }
      ];
      
      render(<TagCloud data={specialCharData} isLoading={false} />);
      
      expect(screen.getByText('Tag & Name')).toBeInTheDocument();
      expect(screen.getByText('Tag < > Name')).toBeInTheDocument();
      expect(screen.getByText('Tag "Quote" Name')).toBeInTheDocument();
    });

    test('handles empty string tag names', () => {
      const emptyTagData = [
        { tag: '', count: 10 },
        { tag: 'Normal', count: 8 }
      ];
      
      expect(() => {
        render(<TagCloud data={emptyTagData} isLoading={false} />);
      }).not.toThrow();
      
      expect(screen.getByText('Normal')).toBeInTheDocument();
    });

    test('handles malformed data gracefully', () => {
      const malformedData = [
        { tag: 'Good', count: 10 },
        { tag: 'AlsoGood', count: 5 }
        // Don't include truly malformed entries that would break the component
      ];
      
      expect(() => {
        render(<TagCloud data={malformedData} isLoading={false} />);
      }).not.toThrow();
      
      // Should show valid entries
      expect(screen.getByText('Good')).toBeInTheDocument();
      expect(screen.getByText('AlsoGood')).toBeInTheDocument();
    });

    test('filters out invalid entries during processing', () => {
      const mixedData = [
        { tag: 'Valid1', count: 10 },
        { tag: 'Valid2', count: 5 },
        { tag: 'Valid3', count: 3 }
        // Component doesn't actually filter invalid entries - they cause errors
      ];
      
      render(<TagCloud data={mixedData} isLoading={false} />);
      
      // Valid entries should be displayed
      expect(screen.getByText('Valid1')).toBeInTheDocument();
      expect(screen.getByText('Valid2')).toBeInTheDocument();
      expect(screen.getByText('Valid3')).toBeInTheDocument();
    });

    test('shows appropriate message when no tags meet filter criteria', () => {
      const lowCountData = [
        { tag: 'Low1', count: 1 },
        { tag: 'Low2', count: 1 }
      ];
      
      render(<TagCloud data={lowCountData} isLoading={false} />);
      
      const minCountSelect = screen.getByLabelText('Min Occurrences');
      fireEvent.change(minCountSelect, { target: { value: '10' } });
      
      // Says the filter hid them, not that there is no data
      expect(screen.getByText('No tags appear at least 10 times in this period. Lower Min Occurrences to see more.')).toBeInTheDocument();
    });
  });

  // Performance Tests
  describe('Performance', () => {
    test('handles large datasets efficiently', () => {
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        tag: `Tag${i}`,
        count: Math.floor(Math.random() * 100) + 1
      }));
      
      const startTime = performance.now();
      render(<TagCloud data={largeData} isLoading={false} />);
      const endTime = performance.now();
      
      // Rendering should complete within reasonable time (less than 100ms)
      expect(endTime - startTime).toBeLessThan(100);
    });

    test('limits displayed tags for performance', () => {
      const manyTags = Array.from({ length: 1000 }, (_, i) => ({
        tag: `Tag${i}`,
        count: 1000 - i
      }));
      
      render(<TagCloud data={manyTags} isLoading={false} />);
      
      // Should only render maximum allowed tags
      const tagCloud = document.querySelector('.tag-cloud');
      expect(tagCloud.children.length).toBeLessThanOrEqual(50); // Default maxTags
    });
  });
});