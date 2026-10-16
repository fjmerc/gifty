import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GiftFilters from '../GiftFilters';

// FontAwesome icons render as a span named after the icon
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, className, style }) => (
    <span data-testid={`${icon.iconName}-icon`} className={className} style={style} />
  ),
}));

describe('GiftFilters', () => {
  const mockCategories = [
    { category: 'Electronics', count: 15 },
    { category: 'Books', count: 8 },
    { category: 'Clothing', count: 12 },
    { category: 'Home & Garden', count: 6 }
  ];

  const defaultFilters = {
    categories: [],
    tags: [],
    search: ''
  };

  const mockOnFilterChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('renders the component with correct structure', () => {
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('Filters')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search gifts...')).toBeInTheDocument();
      expect(screen.getByText('Search')).toBeInTheDocument();
      expect(screen.getByText('Categories')).toBeInTheDocument();
    });

    it('renders expanded by default', () => {
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const filtersDiv = screen.getByText('Filters').closest('.gift-filters');
      expect(filtersDiv).toHaveClass('expanded');
      
      const filtersContent = screen.getByText('Categories').closest('.filters-content');
      expect(filtersContent).toHaveClass('visible');
    });

    it('displays times icon when expanded', () => {
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByTestId('xmark-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('filter-icon')).not.toBeInTheDocument();
    });

    it('renders all categories with counts', () => {
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      mockCategories.forEach(({ category, count }) => {
        expect(screen.getByText(`${category} (${count})`)).toBeInTheDocument();
      });
    });

    it('renders search icon', () => {
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByTestId('magnifying-glass-icon')).toBeInTheDocument();
    });
  });

  describe('Expand/Collapse Functionality', () => {
    it('collapses when toggle button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const toggleButton = screen.getByRole('button', { name: /collapse filters/i });
      await user.click(toggleButton);

      const filtersDiv = screen.getByText('Filters').closest('.gift-filters');
      expect(filtersDiv).not.toHaveClass('expanded');
      
      const filtersContent = screen.getByText('Categories').closest('.filters-content');
      expect(filtersContent).not.toHaveClass('visible');
    });

    it('shows filter icon when collapsed', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const toggleButton = screen.getByRole('button', { name: /collapse filters/i });
      await user.click(toggleButton);

      expect(screen.getByTestId('filter-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('xmark-icon')).not.toBeInTheDocument();
    });

    it('expands again when clicked while collapsed', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      // Collapse first
      const toggleButton = screen.getByRole('button', { name: /collapse filters/i });
      await user.click(toggleButton);

      // Expand again
      const filterButton = screen.getByRole('button', { name: /expand filters/i });
      await user.click(filterButton);

      const filtersDiv = screen.getByText('Filters').closest('.gift-filters');
      expect(filtersDiv).toHaveClass('expanded');
    });
  });

  describe('Search Functionality', () => {
    it('updates search input when typing', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search gifts...');
      await user.type(searchInput, 'test search');

      expect(searchInput).toHaveValue('test search');
    });

    it('calls onFilterChange when search form is submitted', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search gifts...');
      const searchButton = screen.getByRole('button', { name: 'Search' });

      await user.type(searchInput, 'electronics');
      await user.click(searchButton);

      expect(mockOnFilterChange).toHaveBeenCalledWith({ search: 'electronics' });
    });

    it('calls onFilterChange when Enter is pressed in search input', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search gifts...');
      await user.type(searchInput, 'books');
      await user.keyboard('{Enter}');

      expect(mockOnFilterChange).toHaveBeenCalledWith({ search: 'books' });
    });

    it('displays existing search value from filters prop', () => {
      const filtersWithSearch = {
        ...defaultFilters,
        search: 'existing search'
      };

      render(
        <GiftFilters 
          filters={filtersWithSearch}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search gifts...');
      expect(searchInput).toHaveValue('existing search');
    });

    it('can search with empty string', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const searchButton = screen.getByRole('button', { name: 'Search' });
      await user.click(searchButton);

      expect(mockOnFilterChange).toHaveBeenCalledWith({ search: '' });
    });
  });

  describe('Category Filtering', () => {
    it('renders checkboxes for all categories', () => {
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      mockCategories.forEach(({ category }) => {
        const checkbox = screen.getByRole('checkbox', { name: new RegExp(category) });
        expect(checkbox).toBeInTheDocument();
        expect(checkbox).not.toBeChecked();
      });
    });

    it('shows selected categories as checked', () => {
      const filtersWithCategories = {
        ...defaultFilters,
        categories: ['Electronics', 'Books']
      };

      render(
        <GiftFilters 
          filters={filtersWithCategories}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByRole('checkbox', { name: /electronics/i })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /books/i })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /clothing/i })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: /home & garden/i })).not.toBeChecked();
    });

    it('adds category when unchecked checkbox is clicked', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const electronicsCheckbox = screen.getByRole('checkbox', { name: /electronics/i });
      await user.click(electronicsCheckbox);

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        categories: ['Electronics']
      });
    });

    it('removes category when checked checkbox is clicked', async () => {
      const user = userEvent.setup();
      const filtersWithCategories = {
        ...defaultFilters,
        categories: ['Electronics', 'Books']
      };

      render(
        <GiftFilters 
          filters={filtersWithCategories}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const electronicsCheckbox = screen.getByRole('checkbox', { name: /electronics/i });
      await user.click(electronicsCheckbox);

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        categories: ['Books']
      });
    });

    it('handles multiple category selections', async () => {
      const user = userEvent.setup();
      const filtersWithOneCategory = {
        ...defaultFilters,
        categories: ['Electronics']
      };

      render(
        <GiftFilters 
          filters={filtersWithOneCategory}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const booksCheckbox = screen.getByRole('checkbox', { name: /books/i });
      await user.click(booksCheckbox);

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        categories: ['Electronics', 'Books']
      });
    });
  });

  describe('Sorting', () => {
    it('renders the sort select with Most Popular as default', () => {
      render(
        <GiftFilters
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const sortSelect = screen.getByRole('combobox', { name: /sort by/i });
      expect(sortSelect).toHaveValue('popularity');
    });

    it('offers all backend-supported sort orders', () => {
      render(
        <GiftFilters
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const options = screen.getAllByRole('option').map(o => o.value);
      expect(options).toEqual(['popularity', 'newest', 'price_asc', 'price_desc']);
    });

    it('calls onFilterChange when a sort order is selected', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const sortSelect = screen.getByRole('combobox', { name: /sort by/i });
      await user.selectOptions(sortSelect, 'price_asc');

      expect(mockOnFilterChange).toHaveBeenCalledWith({ sort: 'price_asc' });
    });

    it('reflects the sort value from the filters prop', () => {
      render(
        <GiftFilters
          filters={{ ...defaultFilters, sort: 'newest' }}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByRole('combobox', { name: /sort by/i })).toHaveValue('newest');
    });
  });

  describe('Price Range', () => {
    it('renders min and max price inputs', () => {
      render(
        <GiftFilters
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByRole('spinbutton', { name: /minimum price/i })).toBeInTheDocument();
      expect(screen.getByRole('spinbutton', { name: /maximum price/i })).toBeInTheDocument();
    });

    it('applies the price range on submit', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      await user.type(screen.getByRole('spinbutton', { name: /minimum price/i }), '10');
      await user.type(screen.getByRole('spinbutton', { name: /maximum price/i }), '50');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      expect(mockOnFilterChange).toHaveBeenCalledWith({ minPrice: '10', maxPrice: '50' });
    });

    it('allows applying only a max price', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      await user.type(screen.getByRole('spinbutton', { name: /maximum price/i }), '25');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      expect(mockOnFilterChange).toHaveBeenCalledWith({ minPrice: '', maxPrice: '25' });
    });

    it('shows the clear button when a price filter is active', () => {
      render(
        <GiftFilters
          filters={{ ...defaultFilters, minPrice: '10' }}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('Clear All Filters')).toBeInTheDocument();
    });

    it('clears the price inputs when clear button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters
          filters={{ ...defaultFilters, minPrice: '10', maxPrice: '50' }}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      await user.click(screen.getByText('Clear All Filters'));

      expect(screen.getByRole('spinbutton', { name: /minimum price/i })).toHaveValue(null);
      expect(screen.getByRole('spinbutton', { name: /maximum price/i })).toHaveValue(null);
    });
  });

  describe('Clear Filters Functionality', () => {
    it('does not show clear button when no filters are active', () => {
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.queryByText('Clear All Filters')).not.toBeInTheDocument();
    });

    it('shows clear button when categories are selected', () => {
      const filtersWithCategories = {
        ...defaultFilters,
        categories: ['Electronics']
      };

      render(
        <GiftFilters 
          filters={filtersWithCategories}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('Clear All Filters')).toBeInTheDocument();
    });

    it('shows clear button when search is active', () => {
      const filtersWithSearch = {
        ...defaultFilters,
        search: 'test'
      };

      render(
        <GiftFilters 
          filters={filtersWithSearch}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('Clear All Filters')).toBeInTheDocument();
    });

    it('shows clear button when both categories and search are active', () => {
      const filtersWithBoth = {
        ...defaultFilters,
        categories: ['Electronics'],
        search: 'test'
      };

      render(
        <GiftFilters 
          filters={filtersWithBoth}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('Clear All Filters')).toBeInTheDocument();
    });

    it('clears all filters when clear button is clicked', async () => {
      const user = userEvent.setup();
      const filtersWithData = {
        categories: ['Electronics', 'Books'],
        tags: ['gift', 'popular'],
        search: 'test search'
      };

      render(
        <GiftFilters 
          filters={filtersWithData}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const clearButton = screen.getByText('Clear All Filters');
      await user.click(clearButton);

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        categories: [],
        tags: [],
        search: '',
        minPrice: '',
        maxPrice: ''
      });
    });

    it('clears search input when clear button is clicked', async () => {
      const user = userEvent.setup();
      const filtersWithSearch = {
        ...defaultFilters,
        search: 'test search'
      };

      render(
        <GiftFilters 
          filters={filtersWithSearch}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search gifts...');
      expect(searchInput).toHaveValue('test search');

      const clearButton = screen.getByText('Clear All Filters');
      await user.click(clearButton);

      expect(searchInput).toHaveValue('');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('handles empty categories array', () => {
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={[]}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('Categories')).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('handles missing categories prop', () => {
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={undefined}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('Categories')).toBeInTheDocument();
    });

    it('handles categories with special characters', () => {
      const specialCategories = [
        { category: 'Arts & Crafts', count: 5 },
        { category: 'Toys/Games', count: 3 },
        { category: 'Health & Beauty', count: 7 }
      ];

      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={specialCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('Arts & Crafts (5)')).toBeInTheDocument();
      expect(screen.getByText('Toys/Games (3)')).toBeInTheDocument();
      expect(screen.getByText('Health & Beauty (7)')).toBeInTheDocument();
    });

    it('handles categories with zero count', () => {
      const categoriesWithZero = [
        { category: 'Electronics', count: 0 },
        { category: 'Books', count: 5 }
      ];

      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={categoriesWithZero}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('Electronics (0)')).toBeInTheDocument();
      expect(screen.getByText('Books (5)')).toBeInTheDocument();
    });

    it('maintains search input state during category changes', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search gifts...');
      await user.type(searchInput, 'electronics');

      const electronicsCheckbox = screen.getByRole('checkbox', { name: /electronics/i });
      await user.click(electronicsCheckbox);

      expect(searchInput).toHaveValue('electronics');
    });

    it('handles rapid toggle clicks', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const toggleButton = screen.getByRole('button', { name: /collapse filters/i });
      
      // Rapid clicks
      await user.click(toggleButton);
      await user.click(toggleButton);
      await user.click(toggleButton);

      const filtersDiv = screen.getByText('Filters').closest('.gift-filters');
      expect(filtersDiv).not.toHaveClass('expanded');
    });
  });

  describe('Accessibility', () => {
    it('has proper form structure', () => {
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const searchForm = document.querySelector('.search-form');
      expect(searchForm).toBeInTheDocument();
      expect(searchForm.tagName).toBe('FORM');
      
      const searchInput = screen.getByRole('textbox');
      expect(searchInput).toBeInTheDocument();
      
      const submitButton = screen.getByRole('button', { name: 'Search' });
      expect(submitButton).toHaveAttribute('type', 'submit');
    });

    it('has accessible labels for checkboxes', () => {
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      mockCategories.forEach(({ category, count }) => {
        const checkbox = screen.getByRole('checkbox', { name: `${category} (${count})` });
        expect(checkbox).toBeInTheDocument();
      });
    });

    it('maintains keyboard navigation', async () => {
      const user = userEvent.setup();
      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search gifts...');
      await user.click(searchInput);
      expect(searchInput).toHaveFocus();

      await user.tab();
      const searchButton = screen.getByRole('button', { name: 'Search' });
      expect(searchButton).toHaveFocus();
    });
  });

  describe('Performance', () => {
    it('does not re-render unnecessarily with same props', () => {
      const { rerender } = render(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      // Re-render with same props
      rerender(
        <GiftFilters 
          filters={defaultFilters}
          categories={mockCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    it('handles large number of categories', () => {
      const manyCategories = Array.from({ length: 50 }, (_, i) => ({
        category: `Category ${i + 1}`,
        count: Math.floor(Math.random() * 20) + 1
      }));

      render(
        <GiftFilters 
          filters={defaultFilters}
          categories={manyCategories}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getAllByRole('checkbox')).toHaveLength(50);
    });
  });
});