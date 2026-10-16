import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import axiosInstance from '../../axiosInstance';
import RecipientBudgetForm from '../../components/forms/js/RecipientBudgetForm';
import BudgetAnalytics from '../../components/js/BudgetAnalytics';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import { formatMoney, formatUnallocated, formatLeftToSpend } from '../../utils/money';
import styles from '../css/Budgets.module.css';
import Modal from '../../components/ui/Modal';

const getStatusClassName = (status) => {
  switch (status?.toLowerCase()) {
    case 'active':
      return styles.statusInProgress;
    case 'inactive':
      return styles.statusPending;
    case 'paused':
      return styles.statusOverdue;
    case 'seasonal':
      return styles.statusCompleted;
    default:
      return styles.statusPending;
  }
};

// The card highlight follows the server's money status for the recipient
const getBudgetCardClassName = (status) => {
  if (status === 'over') return styles.critical;
  if (status === 'warning') return styles.warning;
  return '';
};

const isMissing = (value) => value === null || value === undefined;

// "Left: $30.00" / "Left: Over by $5.00" — the label already says Left
const recipientLeftLabel = (entry, currency) => (
  entry.status === 'unlimited' ? 'Unlimited' : formatLeftToSpend(entry.left, currency)
);

const Budgets = () => {
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const [overallBudget, setOverallBudget] = useState(null);
  const [recipientBudgets, setRecipientBudgets] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRecipientBudgetForm, setShowRecipientBudgetForm] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  // A refused save is shown inside the budget form, never replacing the page
  const [formError, setFormError] = useState(null);

  // Every figure of the year is in the overall budget's currency
  const currency = overallBudget?.currency || 'USD';
  const hasOverallBudget = overallBudget?.exists === true;

  // Check authentication on mount
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  const handleAuthError = useCallback((err) => {
    if (err.response?.status === 401) {
      logout();
      navigate('/login');
      return true;
    }
    return false;
  }, [logout, navigate]);

  const handleCloseRecipientBudgetForm = useCallback(() => {
    setShowRecipientBudgetForm(false);
    setSelectedRecipient(null);
    setFormError(null);
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await axiosInstance.get(`/budgets/analytics/${year}`);
      setAnalytics(response.data);
    } catch (err) {
      console.error('Error fetching budget analytics:', err);
      if (!handleAuthError(err)) {
        setError('Failed to load budget analytics. Please try again.');
      }
    }
  }, [year, handleAuthError]);

  const fetchBudgetData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await axiosInstance.get(`/budgets/all/${year}`);
      setOverallBudget(response.data.overallBudget || null);
      setRecipientBudgets(response.data.recipientBudgets || []);
      await fetchAnalytics();
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching budget data:', err);
      if (!handleAuthError(err)) {
        setError('Failed to load budget data. Please try again.');
      }
      setIsLoading(false);
    }
  }, [year, fetchAnalytics, handleAuthError]);

  const fetchAvailableYears = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/budgets/available-years');
      const years = response.data;
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;
      if (!years.includes(nextYear)) {
        years.push(nextYear);
      }
      years.sort((a, b) => b - a);
      setAvailableYears(years);
      if (!years.includes(year)) {
        setYear(years[0]);
      }
    } catch (err) {
      console.error('Error fetching available years:', err);
      if (!handleAuthError(err)) {
        setError('Failed to load available years. Please try again.');
      }
    }
  }, [year, handleAuthError]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAvailableYears();
    }
  }, [fetchAvailableYears, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && availableYears.length > 0) {
      fetchBudgetData();
    }
  }, [fetchBudgetData, availableYears, isAuthenticated]);

  const handleYearChange = useCallback((e) => {
    setYear(parseInt(e.target.value));
  }, []);

  const handleEditOverallBudget = useCallback(() => {
    navigate(`/budgets/overall/${year}`);
  }, [year, navigate]);

  const handleEditRecipientBudget = useCallback((recipient) => {
    setSelectedRecipient(recipient);
    setFormError(null);
    setShowRecipientBudgetForm(true);
  }, []);

  // The form sends configuration only; the server derives every figure
  const handleSubmitRecipientBudgetForm = useCallback(async (updatedData) => {
    if (!selectedRecipient?._id) {
      console.error('No recipient selected');
      setFormError('No recipient selected. Please try again.');
      return;
    }

    try {
      setFormError(null);
      const { giftStatus, ...budgetConfig } = updatedData;

      await axiosInstance.put(`/recipients/${selectedRecipient._id}`, { giftStatus });

      if (selectedRecipient.budget?.exists) {
        await axiosInstance.put(`/budgets/recipient/${selectedRecipient._id}/${year}`, budgetConfig);
      } else {
        await axiosInstance.post('/budgets/recipient', {
          ...budgetConfig,
          recipientId: selectedRecipient._id,
          year
        });
      }

      await fetchBudgetData();
      handleCloseRecipientBudgetForm();
    } catch (err) {
      console.error('Error updating recipient budget:', err);
      if (!handleAuthError(err)) {
        setFormError(err.response?.data?.message || 'Failed to update recipient budget. Please try again.');
      }
    }
  }, [selectedRecipient, year, fetchBudgetData, handleCloseRecipientBudgetForm, handleAuthError]);

  const handleRefresh = useCallback(() => {
    fetchBudgetData();
  }, [fetchBudgetData]);

  if (!isAuthenticated) return null;
  if (isLoading) {
    return (
      <div className={styles.loading}>
        <FontAwesomeIcon icon={faSpinner} spin /> Loading...
      </div>
    );
  }
  if (error) return <div className={styles.error}>{error}</div>;

  return (
    <div className={styles.container}>
      <div className={styles.budgetDashboard}>
        <div className={styles.contentContainer}>
          <div className={styles.header}>
            <h1 className={styles.title}>Budget Dashboard</h1>
            <div className={styles.yearSelector}>
              <select value={year} onChange={handleYearChange} aria-label="Year">
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button onClick={handleRefresh} className={styles.refreshButton}>
                Refresh
              </button>
            </div>
          </div>

          <div className={styles.overallBudget}>
            <h2>Overall Budget</h2>
            {hasOverallBudget ? (
              <div className={styles.overallBudgetDetails}>
                <div className={styles.budgetAmount}>
                  <span>Budget:</span>
                  <span>{overallBudget.isLimited ? formatMoney(overallBudget.amount, currency) : 'Unlimited'}</span>
                </div>
                <div className={styles.budgetAmount}>
                  <span>Allocated:</span>
                  <span>{formatMoney(overallBudget.allocated, currency)}</span>
                </div>
                {overallBudget.isLimited && (
                  <div className={styles.budgetAmount}>
                    <span>Unallocated:</span>
                    <span>{formatUnallocated(overallBudget.unallocated, currency)}</span>
                  </div>
                )}
                <div className={styles.budgetAmount}>
                  <span>Spent:</span>
                  <span>{formatMoney(overallBudget.spent, currency)}</span>
                </div>
                {overallBudget.isLimited && (
                  <div className={styles.budgetAmount}>
                    <span>Left to spend:</span>
                    <span>{formatLeftToSpend(overallBudget.leftToSpend, currency)}</span>
                  </div>
                )}
                <div className={styles.budgetStatus}>
                  <span>Status:</span>
                  <span>{overallBudget.isLimited ? 'Limited' : 'Unlimited'}</span>
                </div>
                {overallBudget.notes && (
                  <div className={styles.notes}>
                    <span>Notes:</span>
                    <p>{overallBudget.notes}</p>
                  </div>
                )}
                <button className={styles.editButton} onClick={handleEditOverallBudget}>
                  Edit Overall Budget
                </button>
              </div>
            ) : (
              <div className={styles.noBudget}>
                <p>No overall budget set for this year.</p>
                {overallBudget?.spent > 0 && (
                  <div className={styles.budgetAmount}>
                    <span>Spent:</span>
                    <span>{formatMoney(overallBudget.spent, currency)}</span>
                  </div>
                )}
                <button className={styles.addButton} onClick={handleEditOverallBudget}>
                  Add Overall Budget
                </button>
              </div>
            )}
          </div>

          {analytics && (
            <BudgetAnalytics
              analytics={analytics}
              recipientBudgets={recipientBudgets}
              overallBudget={overallBudget}
            />
          )}

          <div className={styles.recipientBudgets}>
            <h2>Recipient Budgets</h2>
            <div className={styles.recipientBudgetsGrid}>
              {recipientBudgets.length > 0 ? (
                recipientBudgets.map((recipient) => {
                  const budget = recipient.budget || {};
                  const hasBudget = budget.exists === true;
                  return (
                    <div
                      key={recipient._id}
                      className={`${styles.recipientBudgetCard} ${getBudgetCardClassName(recipient.status)}`}
                    >
                      <div className={styles.recipientHeader}>
                        <div className={styles.recipientName}>
                          <Link to={`/recipients/${recipient._id}`}>{recipient.firstName} {recipient.lastName}</Link>
                        </div>
                        <div className={`${styles.recipientStatus} ${getStatusClassName(recipient.archived ? 'inactive' : recipient.giftStatus)}`}>
                          {recipient.archived ? 'Archived' : recipient.giftStatus}
                        </div>
                      </div>

                      <div className={styles.budgetDetails}>
                        <div className={styles.budgetType}>
                          {!hasBudget ? (
                            <div className={styles.fixedAllocation}>
                              <span>Budget:</span>
                              <span>No budget</span>
                            </div>
                          ) : (
                            <>
                              <div className={styles.fixedAllocation}>
                                <span>Budget:</span>
                                <span>{isMissing(recipient.limit) ? 'Unlimited' : formatMoney(recipient.limit, currency)}</span>
                              </div>
                              {budget.allocationType === 'percentage' ? (
                                <div className={styles.percentageAllocation}>
                                  <span>Budget Allocation:</span>
                                  <span>{budget.percentageAllocation}% of Overall Budget</span>
                                </div>
                              ) : !isMissing(recipient.limit) && (
                                <div className={styles.fixedAllocation}>
                                  <span>Budget Range:</span>
                                  <span>
                                    {formatMoney(budget.minimumAmount, currency)} - {formatMoney(budget.maximumAmount, currency)}
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {(hasBudget || recipient.spent > 0) && (
                          <div className={styles.spendingDetails}>
                            <div className={styles.spent}>
                              <span>Spent:</span>
                              <span>{formatMoney(recipient.spent, currency)}</span>
                            </div>
                            {hasBudget && (
                              <div className={styles.remaining}>
                                <span>Left:</span>
                                <span>{recipientLeftLabel(recipient, currency)}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {budget.notes && (
                          <div className={styles.notes}>
                            <span>Notes:</span>
                            <p>{budget.notes}</p>
                          </div>
                        )}

                        {/* A recipient budget needs the year's overall budget first */}
                        {/* Archived recipients keep their spending row; restore them to budget again */}
                        {!recipient.archived && !hasBudget && !hasOverallBudget && (
                          <p className={styles.notes}>Set your overall budget for {year} first</p>
                        )}
                        {!recipient.archived && (
                          <button
                            className={styles.editButton}
                            onClick={() => handleEditRecipientBudget(recipient)}
                            disabled={!hasBudget && !hasOverallBudget}
                          >
                            {hasBudget ? 'Edit Budget' : 'Set Budget'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className={styles.noBudgets}>No recipient budgets found for this year.</p>
              )}
            </div>
          </div>
        </div>

        <Modal
          open={Boolean(showRecipientBudgetForm && selectedRecipient)}
          onClose={handleCloseRecipientBudgetForm}
          title={selectedRecipient ? `Customize Budget for ${selectedRecipient.firstName} ${selectedRecipient.lastName}` : ''}
          size="lg"
        >
          {selectedRecipient && (
            <RecipientBudgetForm
              recipient={selectedRecipient}
              onClose={handleCloseRecipientBudgetForm}
              onSubmit={handleSubmitRecipientBudgetForm}
              year={year}
              currency={currency}
              error={formError}
              embedded
            />
          )}
        </Modal>
      </div>
    </div>
  );
};

export default Budgets;
