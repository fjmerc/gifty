import React, { useEffect, useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarDays, faChampagneGlasses, faChevronRight, faDollarSign, faGift, faHeart, faPlus, faToggleOff, faToggleOn, faUsers, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router-dom';
import styles from '../css/UserHome.module.css';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip } from 'chart.js';
import axiosInstance from '../../axiosInstance';
import { useAuth } from '../../AuthContext';
import { toast } from 'react-toastify';
import EventForm from '../../components/forms/js/EventForm';
import AddRecipientForm from '../../components/forms/js/AddRecipientForm';
import OverallBudgetForm from '../../components/forms/js/OverallBudgetForm';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { formatMoney, formatLeftToSpend } from '../../utils/money';
import { todayLocalISO, dateOnlyISO, formatDateOnly, formatInstantDate } from '../../utils/dates';
import { chartThemeOptions, mergeOptions, useThemeColors } from '../../utils/themeColors';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

// Whole rows in the Upcoming Events panel; the rest are one link away
const EVENTS_SHOWN = 4;

// An account this young is on its first visit(s): "Welcome back" would be odd
const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;
const isNewAccount = (user) => Date.now() - Date.parse(user?.createdAt) < NEW_ACCOUNT_MS;

const UserHome = () => {
  const colors = useThemeColors();
  // AuthContext already holds the signed-in user's profile
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [showHolidayEvents, setShowHolidayEvents] = useState(true);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [overallBudget, setOverallBudget] = useState(null);
  // Until the budget answers, the card holds blank lines of its usual
  // height instead of claiming "No budget set"
  const [budgetLoaded, setBudgetLoaded] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showRecipientForm, setShowRecipientForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  // A refused overall budget save is shown in the open form
  const [budgetFormError, setBudgetFormError] = useState(null);
  const [recentPurchases, setRecentPurchases] = useState([]);
  // The empty state waits for the answer, so it never flashes before a list
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);
  const [spendingData, setSpendingData] = useState(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map(month => ({
      month,
      amount: 0
    }));
  });
  const [purchasedGiftsCount, setPurchasedGiftsCount] = useState(0);
  const [recipientsCount, setRecipientsCount] = useState(0);

  const fetchEvents = useCallback(async () => {
    try {
      const eventsResponse = await axiosInstance.get('/events');
      // Event dates are date-only: compare calendar days, not instants
      const today = todayLocalISO();
      const upcomingEvents = eventsResponse.data.filter(event => dateOnlyISO(event.date) >= today);
      const sortedEvents = upcomingEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
      setEvents(sortedEvents);
      
      // We don't call applyHolidayFilter here directly to avoid circular dependencies
      // Instead, the setEvents will trigger the useEffect that applies filters
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  }, []);

  // Helper function to determine if an event is a holiday
  const isHolidayEvent = useCallback((event) => {
    // Check if the event has the isSystemGenerated flag
    if (event.isSystemGenerated === true) {
      return true;
    }
    
    // Check if the event type is 'Holiday' - could be a string or an object with a name property
    let isHolidayType = false;
    
    if (typeof event.type === 'string') {
      isHolidayType = event.type.toLowerCase() === 'holiday';
    } else if (typeof event.type === 'object') {
      isHolidayType = 
        (event.type?.name && event.type.name === 'Holiday') || 
        (event.type?.name && event.type.name.toLowerCase() === 'holiday');
    }

    // Check if recipient is a system account (additional check for the new field)
    let hasSystemRecipient = false;
    if (event.recipient && typeof event.recipient === 'object') {
      hasSystemRecipient = event.recipient.isSystemAccount === true;
    }
    
    return isHolidayType || hasSystemRecipient;
  }, []);

  // Apply holiday filtering to events
  const applyHolidayFilter = useCallback((eventsList) => {
    const filtered = eventsList.filter(event => {
      // If showing holiday events, include all events
      // If not showing holiday events, exclude holiday events
      return showHolidayEvents || !isHolidayEvent(event);
    });
    
    setFilteredEvents(filtered);
  }, [showHolidayEvents, isHolidayEvent]);

  // Function to regenerate holiday events
  const regenerateHolidayEvents = useCallback(async () => {
    try {
      const { created = 0, removed = 0 } = (await axiosInstance.post('/holidays/regenerate')).data;
      toast.success(`Holidays refreshed: ${created} added, ${removed} removed.`);
      await fetchEvents(); // Refresh events to show the new holiday events
    } catch (error) {
      console.error('Error regenerating holiday events:', error);
      toast.error('Could not refresh holidays. Please try again.');
    }
  }, [fetchEvents]);

  const fetchRecipients = async () => {
    try {
      const recipientsResponse = await axiosInstance.get('/recipients');
      const recipients = recipientsResponse.data.map(recipient => ({
        ...recipient,
        tags: recipient.tags.map(tag => ({
          _id: tag._id,
          name: tag.name
        }))
      }));
      setRecipientsCount(recipients.length);
    } catch (error) {
      console.error('Error fetching recipients:', error);
    }
  };

  const fetchBudgets = async () => {
    try {
      const currentYear = new Date().getFullYear();
      
      try {
        const overallBudgetResponse = await axiosInstance.get(`/budgets/overall/${currentYear}`);
        setOverallBudget(overallBudgetResponse.data);
      } catch (budgetError) {
        if (budgetError.response && budgetError.response.status === 404) {
          setOverallBudget(null);
        } else {
          console.error('Error fetching overall budget:', budgetError);
        }
      } finally {
        setBudgetLoaded(true);
      }

      try {
        const analyticsResponse = await axiosInstance.get(`/budgets/analytics/${currentYear}`);
        
        if (analyticsResponse.data.monthlySpending) {
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const updatedSpendingData = months.map((month, index) => ({
            month,
            amount: analyticsResponse.data.monthlySpending[index] || 0
          }));
          setSpendingData(updatedSpendingData);
        }
      } catch (analyticsError) {
        if (analyticsError.response && analyticsError.response.status === 404) {
        } else {
          console.error('Error fetching analytics:', analyticsError);
        }
      }
    } catch (error) {
      console.error('Unexpected error in fetchBudgets:', error);
    }
  };

  useEffect(() => {
    const fetchGifts = async () => {
      try {
        // Fetch only purchased gifts, server-side, without the default 20 cap so
        // the count and recent-purchases list are accurate for large libraries.
        const giftsResponse = await axiosInstance.get('/gifts', {
          params: { status: 'purchased', limit: 1000, sortBy: 'purchaseDate', sortOrder: 'desc' }
        });
        
        // Add robust format handling like in Gifts.js
        let responseData = giftsResponse.data;
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
          return; // Exit early if format is not recognized
        }

        const purchasedGifts = giftsData.filter(gift => 
          gift.status === 'purchased' && gift.purchaseDate
        );
        setPurchasedGiftsCount(purchasedGifts.length);

        // Debug log to inspect the dates before sorting

        // Improved date sorting with more robust parsing
        const sortedPurchases = [...purchasedGifts].sort((a, b) => {
          // Parse dates, forcing UTC to avoid timezone issues
          const dateAStr = a.purchaseDate.replace(' ', 'T');
          const dateBStr = b.purchaseDate.replace(' ', 'T');
          
          const dateA = new Date(dateAStr);
          const dateB = new Date(dateBStr);
          
          
          // Check for invalid dates
          if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
            console.error('Invalid date comparison:', {
              dateA: a.purchaseDate,
              dateB: b.purchaseDate,
              parsedA: dateA,
              parsedB: dateB
            });
            return 0; // Can't sort invalid dates
          }
          
          // Sort in descending order (newest first)
          return dateB.getTime() - dateA.getTime();
        });

        // Debug log to inspect the dates after sorting
        
        setRecentPurchases(sortedPurchases.slice(0, 3));
      } catch (error) {
        console.error('Error fetching gifts:', error);
      } finally {
        setPurchasesLoaded(true);
      }
    };

    // Independent requests (each handles its own errors): fetch them side by side
    fetchEvents();
    fetchBudgets();
    fetchRecipients();
    fetchGifts();
  }, [fetchEvents]);

  // Apply holiday filter when showHolidayEvents or events change
  useEffect(() => {
    applyHolidayFilter(events);
  }, [showHolidayEvents, events, applyHolidayFilter]);

  // Every figure of the year comes from the server, in the overall budget's currency
  const currency = overallBudget?.currency || 'USD';
  const hasOverallBudget = overallBudget?.exists === true;
  const formatCurrency = (amount) => formatMoney(amount, currency);
  const currencySymbol = formatMoney(0, currency).replace(/[\d.,\s]/g, '') || '$';

  const handleEventSubmit = async () => {
    await fetchEvents();
    setShowEventForm(false);
  };

  const handleRecipientSubmit = async (recipientData) => {
    try {
      await axiosInstance.post('/recipients', recipientData);
      setShowRecipientForm(false); // Close modal first
      await fetchRecipients(); // Then update the recipients count
    } catch (error) {
      console.error('Error adding recipient:', error);
      throw error; // Re-throw the error to be handled by the form
    }
  };

  const handleBudgetSubmit = async (budgetData) => {
    try {
      setBudgetFormError(null);
      const currentYear = new Date().getFullYear();
      if (hasOverallBudget) {
        await axiosInstance.put(`/budgets/overall/${currentYear}`, budgetData);
      } else {
        await axiosInstance.post('/budgets/overall', budgetData);
      }
      await fetchBudgets();
      setShowBudgetForm(false);
    } catch (error) {
      console.error('Error updating budget:', error);
      setBudgetFormError(error.response?.data?.message || 'Failed to save the budget. Please try again.');
    }
  };


  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.welcomeText}>
          {user
            ? `${isNewAccount(user) ? 'Welcome' : 'Welcome back'}, ${user.firstName}!`
            : 'Welcome to Gifty'}
        </h1>
      </div>

      <div className={styles.statsGrid}>
        <div className={`${styles.card} ${styles.statCard}`}>
          <Link to="/events" className={styles.statLink}>
            <div className={styles.iconWrapper}>
              <FontAwesomeIcon icon={faCalendarDays} />
            </div>
            <div className={styles.statInfo}>
              <p>Upcoming Events</p>
              <p>{events.length}</p>
            </div>
          </Link>
        </div>

        <div className={`${styles.card} ${styles.statCard}`}>
          <Link to="/purchase-history" className={styles.statLink}>
            <div className={styles.iconWrapper}>
              <FontAwesomeIcon icon={faGift} />
            </div>
            <div className={styles.statInfo}>
              <p>Purchased Gifts</p>
              <p>{purchasedGiftsCount}</p>
            </div>
          </Link>
        </div>

        <div className={`${styles.card} ${styles.statCard}`}>
          <Link to="/budgets" className={styles.statLink}>
            <div className={styles.iconWrapper}>
              <FontAwesomeIcon icon={faDollarSign} />
            </div>
            <div className={styles.budgetInfo}>
              <p>Yearly Budget</p>
              {!budgetLoaded ? (
                <p className={styles.budgetAmount} aria-hidden="true">{'\u00a0'}</p>
              ) : hasOverallBudget ? (
                <>
                  <p className={styles.budgetAmount}>
                    {overallBudget.isLimited ? formatCurrency(overallBudget.amount) : 'Unlimited'}
                  </p>
                  <dl className={styles.budgetRows}>
                    <div>
                      <dt>Spent</dt>
                      <dd>{formatCurrency(overallBudget.spent)}</dd>
                    </div>
                    {overallBudget.isLimited && (
                      <div>
                        <dt>Left</dt>
                        <dd className={overallBudget.leftToSpend < 0 ? styles.overBudget : undefined}>
                          {formatLeftToSpend(overallBudget.leftToSpend, currency)}
                        </dd>
                      </div>
                    )}
                  </dl>
                </>
              ) : (
                <p className={styles.noBudget}>No budget set for {new Date().getFullYear()}</p>
              )}
            </div>
          </Link>
          <button 
            className={styles.addEventButton}
            onClick={(e) => {
              e.stopPropagation();
              setBudgetFormError(null);
              setShowBudgetForm(true);
            }}
            title={hasOverallBudget ? "Update Budget" : "Set Budget"}
            aria-label={hasOverallBudget ? "Update budget" : "Set budget"}
          >
            <FontAwesomeIcon icon={faPlus} style={{ fontSize: '1.25rem' }} />
          </button>
        </div>

        <div className={`${styles.card} ${styles.statCard}`}>
          <Link to="/recipients" className={styles.statLink}>
            <div className={styles.iconWrapper}>
              <FontAwesomeIcon icon={faUsers} />
            </div>
            <div className={styles.statInfo}>
              <p>Recipients</p>
              <p>{recipientsCount}</p>
            </div>
          </Link>
          <button 
            className={styles.addEventButton}
            onClick={(e) => {
              e.stopPropagation();
              setShowRecipientForm(true);
            }}
            title="Add New Recipient"
            aria-label="Add new recipient"
          >
            <FontAwesomeIcon icon={faPlus} style={{ fontSize: '1.25rem' }} />
          </button>
        </div>
      </div>

      <div className={styles.mainGrid}>
        <div className={`${styles.card} ${styles.chartCard}`}>
          <h3 className={styles.chartTitle}>Gift Spending Overview</h3>
          <div className={styles.chartArea}>
            <Line
              role="img"
              aria-label={`Gift spending by month: ${spendingData.map(({ month, amount }) => `${month} ${formatCurrency(amount)}`).join(', ')}`}
              data={{
                labels: spendingData.map(({ month }) => month),
                datasets: [{
                  label: 'Spent',
                  data: spendingData.map(({ amount }) => amount),
                  borderColor: colors['data-1'],
                  backgroundColor: colors['data-1'],
                  borderWidth: 2,
                  pointRadius: 4,
                  pointHoverRadius: 6,
                  cubicInterpolationMode: 'monotone',
                }],
              }}
              options={mergeOptions(chartThemeOptions(colors, { scales: ['x', 'y'] }), {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.parsed.y) } },
                },
                scales: {
                  x: { border: { dash: [3, 3] } },
                  y: {
                    beginAtZero: true,
                    border: { dash: [3, 3] },
                    // Whole amounts on the axis (an empty year showed 0.1 … 1.0)
                    ticks: { precision: 0 },
                    title: { display: true, text: `Amount (${currencySymbol})` },
                  },
                },
              })}
            />
          </div>
        </div>

        <div className={`${styles.card} ${styles.eventsCard}`}>
          <div className={styles.eventHeader}>
            <h3 className={styles.chartTitle}>Upcoming Events</h3>
            <button 
              className={styles.addEventButton}
              onClick={() => setShowEventForm(true)}
              title="Add New Event"
              aria-label="Add new event"
            >
              <FontAwesomeIcon icon={faPlus} style={{ fontSize: '1.25rem' }} />
            </button>
          </div>
          <div className={styles.toggles}>
            <button
              type="button"
              className={styles.holidayToggle}
              onClick={() => setShowHolidayEvents(!showHolidayEvents)}
              title={showHolidayEvents ? "Hide Holiday Events" : "Show Holiday Events"}
              aria-label="Holiday Events"
              aria-pressed={showHolidayEvents}
            >
              {showHolidayEvents ? (
                <>
                  <FontAwesomeIcon icon={faToggleOn} style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }} />
                  <span className={styles.toggleLabel}>Holiday Events</span>
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faToggleOff} style={{ fontSize: '1.25rem' }} />
                  <span className={styles.toggleLabel}>Holiday Events</span>
                </>
              )}
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={regenerateHolidayEvents}
              title="Regenerate Holiday Events"
            >
              Refresh Holidays
            </Button>
          </div>
          <div className={styles.eventList}>
            {filteredEvents.length === 0 ? (
              <div className={styles.noEvents}>
                {showHolidayEvents ? 
                  "No upcoming events found." : 
                  "No non-holiday events found. Try enabling holiday events."}
              </div>
            ) : (
              filteredEvents.slice(0, EVENTS_SHOWN).map((event) => (
                <div 
                  key={event._id} 
                  className={`${styles.eventItem} ${isHolidayEvent(event) ? styles.holidayEvent : ''}`}
                >
                  <div className={styles.eventInfo}>
                    {isHolidayEvent(event) && <FontAwesomeIcon icon={faChampagneGlasses} style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }} />}
                    {!isHolidayEvent(event) && event.type === 'birthday' && <FontAwesomeIcon icon={faWandMagicSparkles} className="text-warning" style={{ fontSize: '1.25rem' }} />}
                    {!isHolidayEvent(event) && event.type === 'anniversary' && <FontAwesomeIcon icon={faHeart} className="text-destructive" style={{ fontSize: '1.25rem' }} />}
                    {!isHolidayEvent(event) && event.type === 'other' && <FontAwesomeIcon icon={faGift} className="text-info" style={{ fontSize: '1.25rem' }} />}
                    <div>
                      <p className={styles.eventName} title={event.name}>{event.name}</p>
                      <p className={styles.eventDate}>
                        {formatDateOnly(event.date)}
                        {isHolidayEvent(event) && <span className={styles.holidayLabel}> (Holiday)</span>}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {filteredEvents.length > 0 && (
            <Link to="/events" className={styles.ghostLink}>
              View all events
              <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
            </Link>
          )}
        </div>

        <div className={`${styles.card} ${styles.purchaseHistoryCard}`}>
          <div className={styles.eventHeader}>
            <h3 className={styles.chartTitle}>Recent Purchases</h3>
            <Link to="/purchase-history" className={styles.ghostLink}>
              View All
              <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
            </Link>
          </div>
          <div>
            {purchasesLoaded && recentPurchases.length === 0 && (
              <div className={styles.emptyState}>
                <p>No purchases yet. Mark a gift as purchased on the Gifts page and it shows up here.</p>
                <Link to="/gifts" className={styles.emptyAction}>Go to Gifts</Link>
              </div>
            )}
            {recentPurchases.map((purchase) => (
              <div key={purchase._id} className={styles.eventItem}>
                <div className={styles.eventInfo}>
                  <FontAwesomeIcon icon={faGift} style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }} />
                  <div>
                    <p className={styles.eventName} title={purchase.name}>{purchase.name}</p>
                    <p className={styles.eventDate}>
                      {formatInstantDate(purchase.purchaseDate)} - {purchase.recipient ? `${purchase.recipient.firstName} ${purchase.recipient.lastName}` : 'N/A'}
                    </p>
                  </div>
                </div>
                <div className={styles.purchasePrice}>
                  {formatCurrency(purchase.price)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={showEventForm} onClose={() => setShowEventForm(false)} title="Create New Event" size="lg">
        <EventForm
          onClose={() => setShowEventForm(false)}
          onSubmit={handleEventSubmit}
          isEditing={false}
          showTitle={false}
        />
      </Modal>

      <Modal open={showRecipientForm} onClose={() => setShowRecipientForm(false)} title="Add Recipient" size="lg">
        <AddRecipientForm
          onSubmit={handleRecipientSubmit}
          onCancel={() => setShowRecipientForm(false)}
          showTitle={false}
        />
      </Modal>

      <Modal
        open={showBudgetForm}
        onClose={() => setShowBudgetForm(false)}
        title={`Set Overall Budget for ${new Date().getFullYear()}`}
      >
        <OverallBudgetForm
          budget={overallBudget}
          onClose={() => setShowBudgetForm(false)}
          onSubmit={handleBudgetSubmit}
          year={new Date().getFullYear()}
          error={budgetFormError}
          showTitle={false}
        />
      </Modal>
    </div>
  );
};

export default UserHome;