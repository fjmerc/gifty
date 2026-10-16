import React, { useState, useEffect, useCallback, useRef } from 'react';
import axiosInstance from '../../axiosInstance';
import { useNavigate, Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faEdit, 
  faTrash, 
  faStar as fasStar, 
  faSpinner, 
  faSave, 
  faDollarSign, 
  faFilter
} from '@fortawesome/free-solid-svg-icons';
import { faStar as farStar } from '@fortawesome/free-regular-svg-icons';
import { Tooltip } from 'react-tooltip';
import styles from '../css/Gifts.module.css'; // Reusing the Gifts.module.css styles
import favStyles from '../css/Favorites.module.css'; // Additional styles for favorites
import { formatMoney } from '../../utils/money';
import { getBudgetDisplay as getBudgetLabel } from '../../utils/giftBudget';
import { todayLocalISO } from '../../utils/dates';
import useConfirm from '../../components/ui/useConfirm';
import WebSources from '../../components/ui/WebSources';

const Favorites = () => {
  const navigate = useNavigate();
  const timeoutRef = useRef(null);
  const { confirm, confirmDialog } = useConfirm();
  const [favorites, setFavorites] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [budgets, setBudgets] = useState({ overallBudget: null, recipientBudgets: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [filterRecipient, setFilterRecipient] = useState('');
  const [selectedGifts, setSelectedGifts] = useState([]);
  const [operationLoading, setOperationLoading] = useState({});

  // Every figure of the year is in the overall budget's currency
  const currency = budgets?.currency || budgets?.overallBudget?.currency || 'USD';

  const fetchFavorites = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await axiosInstance.get('/gifts/favorites');
      setFavorites(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching favorites:', err);
      setError('Failed to load favorites. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchRecipients = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/recipients');
      setRecipients(response.data);
    } catch (err) {
      console.error('Error fetching recipients:', err);
    }
  }, []);

  const fetchBudgets = useCallback(async () => {
    try {
      const currentYear = new Date().getFullYear();
      const response = await axiosInstance.get(`/budgets/all/${currentYear}`);
      setBudgets(response.data || { overallBudget: null, recipientBudgets: [] });
    } catch (err) {
      console.error('Error fetching budgets:', err);
      setBudgets({ overallBudget: null, recipientBudgets: [] });
    }
  }, []);

  useEffect(() => {
    // Fetch all necessary data
    Promise.all([
      fetchFavorites(),
      fetchRecipients(),
      fetchBudgets()
    ]);
  }, [fetchFavorites, fetchRecipients, fetchBudgets]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleFilterChange = (e) => {
    setFilterRecipient(e.target.value);
  };

  const handleGiftSelection = (giftId) => {
    setSelectedGifts(prevSelected => 
      prevSelected.includes(giftId)
        ? prevSelected.filter(id => id !== giftId)
        : [...prevSelected, giftId]
    );
  };

  const handleDeleteSelectedGifts = async () => {
    const confirmed = await confirm({
      title: 'Delete selected gifts',
      message: `Delete ${selectedGifts.length} selected gift(s)? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    const results = await Promise.allSettled(selectedGifts.map(giftId =>
      axiosInstance.delete(`/gifts/${giftId}`).then(() => giftId)
    ));
    const deletedIds = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failedCount = results.length - deletedIds.length;

    setFavorites(prevFavorites => prevFavorites.filter(gift => !deletedIds.includes(gift._id)));
    setSelectedGifts(prevSelected => prevSelected.filter(id => !deletedIds.includes(id)));
    await fetchBudgets();

    if (failedCount > 0) {
      console.error(`Failed to delete ${failedCount} gift(s)`);
      setError(`Failed to delete ${failedCount} of ${results.length} gifts. Please try again.`);
    }
  };

  const handleFavoriteToggle = async (giftId) => {
    try {
      await axiosInstance.patch(`/gifts/${giftId}/favorite`);
      // Remove from favorites list since it's no longer a favorite
      setFavorites(prevFavorites => prevFavorites.filter(gift => gift._id !== giftId));
    } catch (err) {
      console.error('Error updating favorite status:', err);
      setError('Failed to update favorite status. Please try again.');
    }
  };

  const handleEditGift = (giftId) => {
    // Navigate to the gifts page with a query parameter to open the edit form
    navigate(`/gifts?edit=${giftId}`);
  };

  const handleDeleteGift = async (giftId) => {
    const gift = favorites.find(g => g._id === giftId);
    const confirmed = await confirm({
      title: 'Delete gift',
      message: gift ? `Delete "${gift.name}"? This cannot be undone.` : 'Delete this gift? This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await axiosInstance.delete(`/gifts/${giftId}`);
      setFavorites(prevFavorites => prevFavorites.filter(gift => gift._id !== giftId));
      // Spent and Left are derived from purchases; refresh them
      await fetchBudgets();
    } catch (err) {
      console.error('Error deleting gift:', err);
      setError('Failed to delete gift. Please try again.');
    }
  };

  const handleUpdateGiftStatus = async (giftId, newStatus) => {
    try {
      const response = await axiosInstance.patch(`/gifts/${giftId}/status`, { status: newStatus });
      setFavorites(prevFavorites => prevFavorites.map(gift =>
        gift._id === giftId ? { ...gift, ...response.data } : gift
      ));
      // Spent and Left are derived from purchases; refresh them
      await fetchBudgets();
    } catch (err) {
      console.error('Error updating gift status:', err);
      setError('Failed to update gift status. Please try again.');
    }
  };

  const handlePurchaseGift = async (giftId) => {
    if (operationLoading[giftId]) return; // Prevent race conditions
    const giftToPurchase = favorites.find(gift => gift._id === giftId);
    if (giftToPurchase && !(await confirm({
      title: 'Mark as purchased',
      message: `Mark "${giftToPurchase.name}" (${formatMoney(giftToPurchase.price, currency)}) as purchased? It will count toward this year's spending.`,
      confirmLabel: 'Mark purchased',
    }))) {
      return;
    }

    try {
      setOperationLoading(prev => ({ ...prev, [giftId]: true }));
      if (!giftToPurchase) {
        throw new Error('Gift not found');
      }
  
      // A purchase counts on the local day it happens, not on the event's date
      const response = await axiosInstance.post(`/gifts/${giftId}/purchase`, { purchaseDate: todayLocalISO() });
      
      setFavorites(prevFavorites => prevFavorites.map(gift =>
        gift._id === giftId ? {
          ...gift,
          ...response.data.gift,
          status: 'purchased'
        } : gift
      ));

      // The purchase changed budget numbers shown on this page
      await fetchBudgets();

      setSuccessMessage(response.data.warning
        ? `Gift purchased. ${response.data.warning}`
        : 'Gift purchased successfully!');
      // Clear previous timeout if exists
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setSuccessMessage(null);
        timeoutRef.current = null;
      }, 3000);
    } catch (err) {
      console.error('Error purchasing gift:', err);
      setError(err.response?.data?.message || 'Failed to purchase gift. Please try again.');
    } finally {
      setOperationLoading(prev => ({ ...prev, [giftId]: false }));
    }
  };

  const getBudgetDisplay = (gift) => {
    const { label, kind } = getBudgetLabel(gift, budgets?.recipientBudgets, currency);
    const className = kind === 'none'
      ? styles.noBudget
      : kind === 'unlimited'
        ? styles.unlimitedBudget
        : styles.budgetAmount;
    return (
      <p className={styles.budget}>
        <span className={styles.label}>Budget: </span>
        <span className={className}>{label}</span>
      </p>
    );
  };

  const filteredFavorites = filterRecipient
    ? favorites.filter(gift => gift.recipient?._id === filterRecipient)
    : favorites;

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <FontAwesomeIcon icon={faSpinner} spin /> Loading...
      </div>
    );
  }

  return (
    <div className={styles.giftsPage}>
      <div className={styles.container}>
        <h1 className={styles.title}>Favorite Gifts</h1>
        
        <div className={styles.giftList}>
          <div className={styles.filterContainer}>
            <FontAwesomeIcon icon={faFilter} aria-hidden="true" />
            <select value={filterRecipient} onChange={handleFilterChange} aria-label="Filter favorites by recipient">
              <option value="">All Recipients</option>
              {recipients.map(recipient => (
                <option key={recipient._id} value={recipient._id}>
                  {recipient.firstName} {recipient.lastName}
                </option>
              ))}
            </select>
          </div>
          
          {selectedGifts.length > 0 && (
            <button onClick={handleDeleteSelectedGifts} className={styles.deleteSelectedButton}>
              <FontAwesomeIcon icon={faTrash} /> Delete Selected ({selectedGifts.length})
            </button>
          )}
          
          {error && <div className={styles.error}>{error}</div>}
          {successMessage && <div className={styles.success}>{successMessage}</div>}
          
          {filteredFavorites.length === 0 ? (
            <div className={favStyles.emptyState}>
              <h3>No Favorite Gifts</h3>
              <p>You haven't marked any gifts as favorites yet.</p>
              <p>Add gifts to your favorites by clicking the star icon on any gift.</p>
              <Link to="/gifts" className={favStyles.emptyAction}>Go to Gifts</Link>
            </div>
          ) : (
            <div className={styles.giftGrid}>
              {filteredFavorites.map(gift => {
                const giftStatus = gift.status || 'suggestion';
                const giftCurrency = currency;
                return (
                  <div 
                    key={gift._id} 
                    className={`${styles.giftCard} ${gift.isAISuggested ? styles.aiSuggested : ''} ${selectedGifts.includes(gift._id) ? styles.selected : ''}`}
                    onClick={() => handleGiftSelection(gift._id)}
                  >
                    <input
                      type="checkbox"
                      className={styles.selectBox}
                      checked={selectedGifts.includes(gift._id)}
                      onChange={() => handleGiftSelection(gift._id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${gift.name}`}
                    />
                    <div className={styles.giftHeader} onClick={(e) => e.stopPropagation()}>
                      <h3>{gift.name}</h3>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFavoriteToggle(gift._id);
                        }}
                        className={styles.favoriteButton}
                        aria-label="Remove from favorites"
                        title="Remove from favorites"
                      >
                        <FontAwesomeIcon icon={gift.favorite ? fasStar : farStar} />
                      </button>
                    </div>
                    <p>{gift.description}</p>
                    <div className={styles.giftDetails}>
                      <p className={styles.price}>
                        <span className={styles.label}>Price:</span> {formatMoney(gift.price, giftCurrency)}
                      </p>
                      {gift.category && (
                        <p className={styles.category}>
                          <span className={styles.label}>Category:</span> {gift.category}
                        </p>
                      )}
                      {gift.tags && gift.tags.length > 0 && (
                        <p className={styles.tags}>
                          <span className={styles.label}>Tags:</span>{" "}
                          <span className={styles.tagList}>
                            {gift.tags.map((tag, index) => (
                              <span key={index} className={styles.tag}>{tag}</span>
                            ))}
                          </span>
                        </p>
                      )}
                      {gift.whereToBuy && gift.whereToBuy.length > 0 && (
                        <p className={styles.whereToBuy}>
                          <span className={styles.label}>Where to Buy:</span>{" "}
                          {gift.whereToBuy.join(", ")}
                        </p>
                      )}
                      <WebSources sources={gift.webSources} />
                      <p className={styles.recipient}>
                        <span className={styles.label}>Recipient: </span> 
                        {gift.recipient ? `${gift.recipient.firstName} ${gift.recipient.lastName}` : 'Unknown'}
                      </p>
                      <p className={styles.event}>
                        <span className={styles.label}>Event: </span> 
                        {gift.event ? gift.event.name : 'Unknown Event'}
                      </p>
                      <p className={styles.status}>
                        <span className={styles.label}>Status: </span> 
                        {giftStatus.charAt(0).toUpperCase() + giftStatus.slice(1)}
                      </p>
                      {getBudgetDisplay(gift)}
                    </div>
                    {gift.isAISuggested && (
                      <div className={styles.aiInfo}>
                        <p className={styles.aiLabel}>AI Suggested</p>
                        {gift.relevanceScore && gift.relevanceScore < 100 && (
                          <p className={styles.relevanceScore}>
                            Relevance: {gift.relevanceScore}/100
                          </p>
                        )}
                      </div>
                    )}
                    <div className={styles.giftActions} onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditGift(gift._id);
                        }} 
                        className={styles.editButton}
                        data-tooltip-id={`edit-${gift._id}`}
                        data-tooltip-content="Edit gift details"
                        aria-label="Edit gift details"
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <Tooltip id={`edit-${gift._id}`} />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGift(gift._id);
                        }} 
                        className={styles.deleteButton}
                        data-tooltip-id={`delete-${gift._id}`}
                        data-tooltip-content="Delete gift"
                        aria-label="Delete gift"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                      <Tooltip id={`delete-${gift._id}`} />

                      {giftStatus === 'suggestion' && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateGiftStatus(gift._id, 'saved');
                          }} 
                          className={styles.saveButton}
                          data-tooltip-id={`save-${gift._id}`}
                          data-tooltip-content="Save suggestion"
                          aria-label="Save suggestion"
                        >
                          <FontAwesomeIcon icon={faSave} />
                        </button>
                      )}
                      <Tooltip id={`save-${gift._id}`} />

                      {giftStatus !== 'purchased' && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePurchaseGift(gift._id);
                          }} 
                          className={styles.purchaseButton}
                          data-tooltip-id={`purchase-${gift._id}`}
                          data-tooltip-content="Purchase gift"
                          aria-label="Purchase gift"
                        >
                          <FontAwesomeIcon icon={faDollarSign} />
                        </button>
                      )}
                      <Tooltip id={`purchase-${gift._id}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {confirmDialog}
    </div>
  );
};

export default Favorites;
