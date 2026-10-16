import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';

const SORT_OPTIONS = [
  { value: 'popularity', label: 'Most Popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' }
];

const GiftFilters = ({ filters, categories, onFilterChange }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchInput, setSearchInput] = useState(filters.search || '');
  const [priceInput, setPriceInput] = useState({
    min: filters.minPrice || '',
    max: filters.maxPrice || ''
  });

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    onFilterChange({ search: searchInput });
  };

  const handleCategoryToggle = (category) => {
    const updatedCategories = filters.categories.includes(category)
      ? filters.categories.filter(c => c !== category)
      : [...filters.categories, category];

    onFilterChange({ categories: updatedCategories });
  };

  const handleSortChange = (e) => {
    onFilterChange({ sort: e.target.value });
  };

  const handlePriceSubmit = (e) => {
    e.preventDefault();
    onFilterChange({ minPrice: priceInput.min, maxPrice: priceInput.max });
  };

  const clearFilters = () => {
    setSearchInput('');
    setPriceInput({ min: '', max: '' });
    onFilterChange({
      categories: [],
      tags: [],
      search: '',
      minPrice: '',
      maxPrice: ''
    });
  };

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.search ||
    filters.minPrice ||
    filters.maxPrice;

  return (
    <div className={`gift-filters ${isExpanded ? 'expanded' : ''}`}>
      <div className="filters-header">
        <h3>Filters</h3>
        <button
          className="filter-toggle"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? 'Collapse filters' : 'Expand filters'}
        >
          {isExpanded ? <FontAwesomeIcon icon={faXmark} /> : <FontAwesomeIcon icon={faFilter} />}
        </button>
      </div>

      <form onSubmit={handleSearchSubmit} className="search-form">
        <div className="search-input-wrapper">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="search-icon" />
          <input
            type="text"
            placeholder="Search gifts..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="search-input"
          />
        </div>
        <button type="submit" className="search-button">
          Search
        </button>
      </form>

      <div className={`filters-content ${isExpanded ? 'visible' : ''}`}>
        <div className="filter-section">
          <h4 id="sort-heading">Sort by</h4>
          <select
            className="sort-select"
            value={filters.sort || 'popularity'}
            onChange={handleSortChange}
            aria-labelledby="sort-heading"
          >
            {SORT_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="filter-section">
          <h4>Price Range</h4>
          <form onSubmit={handlePriceSubmit} className="price-range-form">
            <input
              type="number"
              min="0"
              placeholder="Min"
              aria-label="Minimum price"
              value={priceInput.min}
              onChange={(e) => setPriceInput(prev => ({ ...prev, min: e.target.value }))}
              className="price-input"
            />
            <span className="price-separator">–</span>
            <input
              type="number"
              min="0"
              placeholder="Max"
              aria-label="Maximum price"
              value={priceInput.max}
              onChange={(e) => setPriceInput(prev => ({ ...prev, max: e.target.value }))}
              className="price-input"
            />
            <button type="submit" className="price-apply-button">
              Apply
            </button>
          </form>
        </div>

        <div className="filter-section">
          <h4>Categories</h4>
          <div className="category-list">
            {categories && categories.map(({ category, count }) => (
              <label key={category} className="category-checkbox">
                <input
                  type="checkbox"
                  checked={filters.categories.includes(category)}
                  onChange={() => handleCategoryToggle(category)}
                />
                <span>{category} ({count})</span>
              </label>
            ))}
          </div>
        </div>

        {hasActiveFilters && (
          <button
            className="clear-filters-btn"
            onClick={clearFilters}
          >
            Clear All Filters
          </button>
        )}
      </div>
    </div>
  );
};

export default GiftFilters;
