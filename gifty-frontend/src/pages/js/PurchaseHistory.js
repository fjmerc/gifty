import React, { useEffect, useState, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPenToSquare } from '@fortawesome/free-regular-svg-icons';
import { Link } from 'react-router-dom';
import axiosInstance from '../../axiosInstance';
import styles from '../css/PurchaseHistory.module.css';
import { formatMoney, sumMoney } from '../../utils/money';
import { todayLocalISO, localDateISO, formatInstantDate } from '../../utils/dates';
import Modal from '../../components/ui/Modal';
import useConfirm from '../../components/ui/useConfirm';

const PurchaseHistory = () => {
  const [purchases, setPurchases] = useState([]);
  const [overallBudget, setOverallBudget] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentPurchase, setCurrentPurchase] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [initialEditDate, setInitialEditDate] = useState('');
  const [editError, setEditError] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const [recipients, setRecipients] = useState([]);
  const { confirm, confirmDialog } = useConfirm();

  const fetchPurchases = async () => {
    try {
      // Default API page size is 20 — request the full purchase history explicitly
      const response = await axiosInstance.get('/gifts', {
        params: { status: 'purchased', limit: 1000, sortBy: 'purchaseDate', sortOrder: 'desc' }
      });
      
      // Add detailed logging to debug the response format
      
      // Handle different response formats
      let responseData = response.data;
      let giftsData = [];

      if (Array.isArray(responseData)) {
        // Format 1: Direct array of gifts
        giftsData = responseData;
      } else if (responseData && responseData.data && Array.isArray(responseData.data)) {
        // Format 2: Object with a data property containing the array
        giftsData = responseData.data;
      } else if (responseData && responseData.gifts && Array.isArray(responseData.gifts)) {
        // Format 3: Object with a gifts property containing the array
        giftsData = responseData.gifts;
      } else {
        console.error('Unexpected response format from /gifts:', responseData);
        console.error('Expected formats: direct array, {data: []}, or {gifts: []}');
        console.error('Received structure:', JSON.stringify(responseData, null, 2));
        setPurchases([]);
        return;
      }
      
      // Filter purchased gifts
      const purchasedGifts = giftsData.filter(gift => gift && gift.status === 'purchased');
      
      // Sort by purchase date, newest first, with robust date handling
      purchasedGifts.sort((a, b) => {
        // Safely handle missing dates or invalid date formats
        if (!a.purchaseDate && !b.purchaseDate) return 0;
        if (!a.purchaseDate) return 1; // b comes first if a has no date
        if (!b.purchaseDate) return -1; // a comes first if b has no date
        
        // Parse dates, forcing UTC to avoid timezone issues
        const dateAStr = typeof a.purchaseDate === 'string' ? a.purchaseDate.replace(' ', 'T') : a.purchaseDate;
        const dateBStr = typeof b.purchaseDate === 'string' ? b.purchaseDate.replace(' ', 'T') : b.purchaseDate;
        
        const dateA = new Date(dateAStr);
        const dateB = new Date(dateBStr);
        
        // Check for invalid dates
        if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
        if (isNaN(dateA.getTime())) return 1; // b comes first if a is invalid
        if (isNaN(dateB.getTime())) return -1; // a comes first if b is invalid
        
        // Sort in descending order (newest first)
        return dateB.getTime() - dateA.getTime();
      });
      
      setPurchases(purchasedGifts);
      
      // Extract unique recipients for the filter
      const uniqueRecipients = {};
      purchasedGifts.forEach(gift => {
        if (gift.recipient) {
          uniqueRecipients[gift.recipient._id] = {
            id: gift.recipient._id,
            name: `${gift.recipient.firstName} ${gift.recipient.lastName}`
          };
        }
      });
      setRecipients(Object.values(uniqueRecipients));
    } catch (error) {
      console.error('Error fetching purchase history:', error);
    }
  };

  const fetchBudget = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const response = await axiosInstance.get(`/budgets/overall/${currentYear}`);
      setOverallBudget(response.data);
    } catch (error) {
      console.error('Error fetching overall budget:', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      await fetchBudget();
      await fetchPurchases();
    };
    fetchData();
  }, []);

  // Every amount is shown in the overall budget's currency
  const currency = overallBudget?.currency || 'USD';


  const openEditModal = (purchase) => {
    setCurrentPurchase(purchase);
    setEditError(null);
    // The date input shows the local day the purchase happened (today if unknown)
    const shownDate = localDateISO(purchase.purchaseDate) || todayLocalISO();
    setEditDate(shownDate);
    setInitialEditDate(shownDate);
    
    // Safely handle price formatting
    const price = purchase.price;
    if (price !== null && price !== undefined && !isNaN(parseFloat(price))) {
      setEditPrice(parseFloat(price).toString());
    } else {
      setEditPrice('0.00'); // Default to 0 if no valid price
    }
    
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setCurrentPurchase(null);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      setEditError(null);
      // A plain gift edit: the server re-derives Spent from the new price and date.
      // The date is sent only when changed, so a price-only edit never re-dates it.
      const updatedPurchase = {
        price: parseFloat(editPrice),
        ...(editDate && editDate !== initialEditDate && { purchaseDate: editDate }),
        ...(currentPurchase.recipient?._id && { recipientId: currentPurchase.recipient._id })
      };

      await axiosInstance.put(`/gifts/${currentPurchase._id}`, updatedPurchase);
      closeEditModal();
      await fetchPurchases(); // Refresh the purchase list
    } catch (error) {
      console.error('Error updating purchase:', error);
      setEditError(error.response?.data?.message || 'Failed to update the purchase. Please try again.');
    }
  };
  
  // A purchase recorded by mistake: back to a saved idea, or gone. Spent is
  // derived from purchases, so either way the budgets follow on their own.
  const runPurchaseAction = async (question, request, failure) => {
    if (!(await confirm(question))) return;
    try {
      setEditError(null);
      await request();
      closeEditModal();
      await fetchPurchases();
    } catch (error) {
      console.error(failure, error);
      setEditError(error.response?.data?.message || `${failure} Please try again.`);
    }
  };

  const handleUnpurchase = () => runPurchaseAction(
    {
      title: 'Mark as not purchased',
      message: `Mark "${currentPurchase.name}" as not purchased? It moves back to your saved gifts and stops counting toward spending.`,
      confirmLabel: 'Mark not purchased',
    },
    () => axiosInstance.patch(`/gifts/${currentPurchase._id}/status`, { status: 'saved' }),
    'Failed to mark the gift as not purchased.'
  );

  const handleDeletePurchase = () => runPurchaseAction(
    {
      title: 'Delete purchase',
      message: `Delete "${currentPurchase.name}"? It is removed for good and stops counting toward spending.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    },
    () => axiosInstance.delete(`/gifts/${currentPurchase._id}`),
    'Failed to delete the purchase.'
  );

  // Reset filters
  const clearFilters = () => {
    setSelectedRecipient('');
  };

  // Filter purchases based on selected criteria
  const filteredPurchases = useMemo(() => {
    // Ensure purchases is an array before filtering
    if (!Array.isArray(purchases)) {
      console.warn('purchases is not an array:', purchases);
      return [];
    }
    
    return purchases.filter(purchase => {
      // Check if purchase is a valid object
      if (!purchase || typeof purchase !== 'object') return false;
      
      // Filter by recipient
      if (selectedRecipient && purchase.recipient && purchase.recipient._id !== selectedRecipient) {
        return false;
      }
      return true;
    });
  }, [purchases, selectedRecipient]);
  
  // Calculate the total amount of filtered purchases
  const filteredTotal = useMemo(() => {
    // Ensure filteredPurchases is an array before reducing
    if (!Array.isArray(filteredPurchases)) return 0;
    
    // A list footer over the rows shown, summed in whole cents
    return sumMoney(filteredPurchases.map(purchase => purchase?.price));
  }, [filteredPurchases]);

  // Get appropriate event style class based on event name
  const getEventClass = (eventName) => {
    if (!eventName) return styles.eventDefault;
    
    const eventNameLower = eventName.toLowerCase();
    
    if (eventNameLower.includes('birthday')) return styles.eventBirthday;
    if (eventNameLower.includes('anniversary')) return styles.eventAnniversary;
    if (eventNameLower.includes('christmas')) return styles.eventChristmas;
    if (eventNameLower.includes('holiday') || eventNameLower.includes('new year')) return styles.eventHoliday;
    if (eventNameLower.includes('graduation')) return styles.eventGraduation;
    if (eventNameLower.includes('wedding')) return styles.eventWedding;
    
    return styles.eventDefault;
  };
  
  return (
    <div className={styles.purchaseHistory}>
      <h1 className={styles.pageTitle}>Purchase History</h1>
      <div className={styles.contentWrapper}>
        
        {/* Filter Controls */}
        <div className={styles.filterControls}>
          <div className={styles.filterGroup}>
            <label htmlFor="purchase-recipient-filter" className={styles.filterLabel}>Filter by Recipient:</label>
            <select 
              id="purchase-recipient-filter"
              className={styles.filterSelect}
              value={selectedRecipient}
              onChange={(e) => setSelectedRecipient(e.target.value)}
            >
              <option value="">All Recipients</option>
              {recipients.map(recipient => (
                <option key={recipient.id} value={recipient.id}>
                  {recipient.name}
                </option>
              ))}
            </select>
          </div>
          
          {selectedRecipient && (
            <button className={styles.clearFilters} onClick={clearFilters}>
              Clear Filters
            </button>
          )}
          
          {/* Total Display */}
          <div className={styles.totalDisplay}>
            <span className={styles.totalLabel} title="Sum of the purchases listed below">Total:</span>
            <span className={styles.totalAmount}>{formatMoney(filteredTotal, currency)}</span>
          </div>
        </div>
        
        <div className={styles.resultsHeader}>
          <div className={styles.resultsCount}>
            {filteredPurchases.length} {filteredPurchases.length === 1 ? 'purchase' : 'purchases'}
            {selectedRecipient && ' with current filter'}
          </div>
        </div>
        
        {filteredPurchases.length > 0 ? (
          // On a phone the table scrolls sideways inside the card (focusable,
          // so the keyboard can scroll it too)
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Purchases">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Item</th>
                <th>Recipient</th>
                <th>Event</th>
                <th>Price</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.map(purchase => (
                <tr key={purchase._id}>
                  <td>{formatInstantDate(purchase.purchaseDate)}</td>
                  <td>{purchase.name}</td>
                  <td>
                    {purchase.recipient ? (
                      <Link
                        to={`/recipients/${purchase.recipient._id}`}
                        className={styles.recipientLink}
                      >
                        {`${purchase.recipient.firstName} ${purchase.recipient.lastName}`}
                      </Link>
                    ) : 'N/A'}
                  </td>
                  <td>
                    {purchase.event ? (
                      <Link
                        to="/events"
                        state={{ selectedEvent: purchase.event._id }}
                        className={`${styles.eventName} ${getEventClass(purchase.event.name)}`}
                      >
                        {purchase.event.name}
                      </Link>
                    ) : 'N/A'}
                  </td>
                  <td>{formatMoney(purchase.price, currency)}</td>
                  <td>
                    <button 
                      className={styles.editButton} 
                      onClick={() => openEditModal(purchase)}
                      aria-label="Edit purchase"
                    >
                      <FontAwesomeIcon icon={faPenToSquare} style={{ fontSize: 18 }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <div className={styles.noResults}>
            No purchases found with the selected filters. Try adjusting your filters or add more purchases.
          </div>
        )}
        
        {/* Edit Modal */}
        <Modal
          open={Boolean(isEditModalOpen && currentPurchase)}
          onClose={closeEditModal}
          title="Edit Purchase"
          footer={currentPurchase && (
            <>
              {/* Changes to the purchase itself, kept apart from Cancel/Save */}
              <div className={styles.footerAside}>
                <button type="button" className={styles.unpurchaseButton} onClick={handleUnpurchase}>
                  Mark as not purchased
                </button>
                <button type="button" className={styles.deleteButton} onClick={handleDeletePurchase}>
                  Delete
                </button>
              </div>
              <button type="button" className={styles.cancelButton} onClick={closeEditModal}>
                Cancel
              </button>
              <button type="submit" form="edit-purchase-form" className={styles.saveButton}>
                Save Changes
              </button>
            </>
          )}
        >
          {currentPurchase && (
              <form id="edit-purchase-form" onSubmit={handleEditSubmit}>
                <div className={styles.formGroup}>
                  <label htmlFor="editDate">Purchase Date:</label>
                  <input
                    type="date"
                    id="editDate"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="editPrice">Price:</label>
                  <input
                    type="number"
                    id="editPrice"
                    step="0.01"
                    min="0"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <span className={styles.fieldLabel}>Item:</span>
                  <p>{currentPurchase.name}</p>
                </div>
                <div className={styles.formGroup}>
                  <span className={styles.fieldLabel}>Recipient:</span>
                  <p>
                    {currentPurchase.recipient
                      ? `${currentPurchase.recipient.firstName} ${currentPurchase.recipient.lastName}`
                      : 'N/A'}
                  </p>
                </div>
                <div className={styles.formGroup}>
                  <span className={styles.fieldLabel}>Event:</span>
                  <p>
                    {currentPurchase.event
                      ? currentPurchase.event.name
                      : 'N/A'}
                  </p>
                </div>
                {editError && <p className={styles.editError} role="alert">{editError}</p>}
              </form>
          )}
        </Modal>
        {confirmDialog}
      </div>
    </div>
  );
};

export default PurchaseHistory;
