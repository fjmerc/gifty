import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  fetchGifts, 
  fetchCategories,
  deleteGift
} from '../../slices/giftLibrarySlice';
import GiftCard from './GiftCard';
import GiftFilters from './GiftFilters';
import InfiniteScroll from 'react-infinite-scroll-component';
import './GiftExplorer.css';

const GiftExplorer = () => {
  const dispatch = useDispatch();
  const { 
    gifts, 
    categories, 
    loading, 
    error, 
    pagination 
  } = useSelector(state => state.giftLibrary);

  const [filters, setFilters] = useState({
    categories: [],
    minPrice: '',
    maxPrice: '',
    tags: [],
    sort: 'popularity',
    search: ''
  });

  // Fetch initial data
  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  // Fetch gifts when filters change; abort superseded requests so a
  // slow stale response can't overwrite results for the new filters
  useEffect(() => {
    const request = dispatch(fetchGifts({ ...filters, page: 1 }));
    return () => request.abort();
  }, [filters, dispatch]);

  // Handle infinite scroll
  const fetchMoreData = useCallback(() => {
    if (!loading && pagination.currentPage < pagination.totalPages) {
      const nextPage = pagination.currentPage + 1;
      dispatch(fetchGifts({ ...filters, page: nextPage }));
    }
  }, [dispatch, filters, loading, pagination]);

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleDeleteGift = (giftId) => {
    dispatch(deleteGift(giftId));
  };

  if (error) {
    return (
      <div className="gift-explorer-wrapper">
        <div className="error-container">
          <h2>Error Loading Gifts</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="gift-explorer-wrapper">
      <div className="gift-explorer-container">
      <div className="gift-explorer-header">
        <h1>Gift Explorer</h1>
        <p>Discover the perfect gift from our curated collection</p>
      </div>

      <div className="gift-explorer-content">
        <aside className="gift-explorer-sidebar">
          <GiftFilters 
            filters={filters}
            categories={categories}
            onFilterChange={handleFilterChange}
          />
        </aside>

        <div className="gift-grid-container">
          {loading && gifts.length === 0 ? (
            <div className="loading-container">
              <h4>Loading gifts...</h4>
            </div>
          ) : gifts.length === 0 && !loading ? (
            <div className="no-gifts-found">
              {filters.search || filters.categories.length > 0 || filters.minPrice || filters.maxPrice ? (
                <>
                  <h3>No gifts match your filters</h3>
                  <p>Try adjusting or clearing your filters to see more gifts.</p>
                </>
              ) : (
                <>
                  <h3>No gifts in the library</h3>
                  <p>The gift library is currently empty. Please check back later or add some gifts.</p>
                </>
              )}
            </div>
          ) : (
            <InfiniteScroll
              dataLength={gifts.length}
              next={fetchMoreData}
              hasMore={pagination.currentPage < pagination.totalPages}
              loader={<h4>Loading more gifts...</h4>}
              endMessage={
                <p className="gift-list-end">You've seen all {pagination.totalItems} gifts!</p>
              }
            >
              <div className="gift-grid">
                {gifts.map(gift => (
                  <GiftCard 
                    key={gift._id} 
                    gift={gift} 
                    onDelete={handleDeleteGift}
                  />
                ))}
              </div>
            </InfiniteScroll>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default GiftExplorer;
