import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPenToSquare } from '@fortawesome/free-solid-svg-icons';
import axiosInstance from '../../axiosInstance';
import styles from '../css/UserProfile.module.css';
import EditUserProfileForm from '../../components/forms/js/EditUserProfileForm';
import { formatDateOnly } from '../../utils/dates';
import { toast } from 'react-toastify';

const AMOUNT_ERROR = 'Enter a budget amount greater than 0, or mark it Unlimited';

const UserProfile = () => {
  const [user, setUser] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [budgetError, setBudgetError] = useState(null);
  const [overallBudget, setOverallBudget] = useState({ 
    year: new Date().getFullYear(), 
    amount: '',
    isLimited: true,
    currency: 'USD',
    notes: ''
  });
  const [budgetReady, setBudgetReady] = useState(false);
  const latestYear = useRef(null);

  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/users/profile');
      setUser(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching user data:', err);
      setError('Failed to load user data. Please try again.');
      setLoading(false);
    }
  }, []);

  // Keep only configuration; an exists:false view is a budget still to be created.
  // Amount is kept as the input text so the field can be cleared.
  const fetchOverallBudget = useCallback(async (yearArg) => {
    const year = yearArg ?? new Date().getFullYear();
    latestYear.current = year;
    setBudgetReady(false);
    try {
      const response = await axiosInstance.get(`/budgets/overall/${year}`);
      if (latestYear.current !== year) return; // a newer year was requested meanwhile
      const data = response.data;
      if (data && data.exists !== false) {
        setOverallBudget({
          _id: data._id,
          year: data.year ?? year,
          amount: data.amount ?? '',
          isLimited: data.isLimited !== false,
          currency: data.currency || 'USD',
          notes: data.notes || ''
        });
      } else {
        setOverallBudget({ year, amount: '', isLimited: true, currency: data?.currency || 'USD', notes: '' });
      }
      setBudgetError(null);
      setBudgetReady(true);
    } catch (err) {
      console.error('Error fetching overall budget:', err);
      // Stay not-ready: saving now would write another year's values
      if (latestYear.current === year) setBudgetError(`Could not load the ${year} budget. Try again.`);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      await fetchUserData();
      await fetchOverallBudget();
    };
    fetchData();
  }, [fetchUserData, fetchOverallBudget]);

  const handleBudgetChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'year') {
      // Show the typed year at once; load that year's own budget once it is a full year
      // Drop the previous year's values at once so they can never be saved under the new year
      setBudgetError(null);
      setBudgetReady(false);
      latestYear.current = null;
      setOverallBudget({ year: value, amount: '', isLimited: true, currency: 'USD', notes: '' });
      if (/^\d{4}$/.test(value)) fetchOverallBudget(Number(value));
      return;
    }
    setOverallBudget(prevBudget => ({
      ...prevBudget,
      [name]: type === 'checkbox' ? !checked : value
    }));
  };

  const handleSetBudget = async () => {
    if (!budgetReady) return;
    const year = Number(overallBudget.year);
    if (!/^\d{4}$/.test(String(overallBudget.year))) {
      setBudgetError('Enter a four-digit year');
      return;
    }
    const amount = overallBudget.amount === '' ? NaN : Number(overallBudget.amount);
    if (overallBudget.isLimited && !(amount > 0)) {
      setBudgetError(AMOUNT_ERROR);
      return;
    }
    try {
      const budgetData = {
        isLimited: overallBudget.isLimited,
        currency: overallBudget.currency,
        notes: overallBudget.notes || ''
      };
      if (Number.isFinite(amount) && amount >= 0) budgetData.amount = amount;

      const method = overallBudget._id ? 'put' : 'post';
      const endpoint = method === 'put'
        ? `/budgets/overall/${year}`
        : '/budgets/overall';
      
      if (method === 'post') {
        budgetData.year = year;
      }

      await axiosInstance[method](endpoint, budgetData);
      setBudgetError(null);
      await fetchOverallBudget(year);
      toast.success('Overall budget set successfully!');
    } catch (err) {
      console.error('Error setting overall budget:', err);
      // Shown next to the budget form so the user can correct it (e.g. the allocation guard)
      setBudgetError(err.response?.data?.message || 'Failed to set overall budget. Please try again.');
    }
  };

  if (loading) return <div className={styles.loading}>Loading user data...</div>;
  if (error) return <div className={styles.error}>{error}</div>;
  if (!user) return <div className={styles.error}>No user data found.</div>;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>User Profile</h1>
      <div className={styles.userProfile}>
        {editMode ? (
          <EditUserProfileForm 
            user={user} 
            onSuccess={() => {
              setEditMode(false);
              fetchUserData();
            }}
            onCancel={() => setEditMode(false)}
          />
        ) : (
          <div className={styles.profileInfo}>
            <div className={styles.formGroup}>
              <label htmlFor="profile-username">Username:</label>
              <input 
                id="profile-username"
                type="text" 
                value={user.username} 
                className={styles.value} 
                readOnly 
                style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-ink-muted)' }}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="profile-email">Email:</label>
              <input 
                id="profile-email"
                type="email" 
                value={user.email} 
                className={styles.value} 
                readOnly 
                style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-ink-muted)' }}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="profile-first-name">First Name:</label>
              <input 
                id="profile-first-name"
                type="text" 
                value={user.firstName} 
                className={styles.value} 
                readOnly 
                style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-ink-muted)' }}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="profile-last-name">Last Name:</label>
              <input 
                id="profile-last-name"
                type="text" 
                value={user.lastName} 
                className={styles.value} 
                readOnly 
                style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-ink-muted)' }}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="profile-date-of-birth">Date of Birth:</label>
              <input 
                id="profile-date-of-birth"
                type="text" 
                value={user.dateOfBirth ? formatDateOnly(user.dateOfBirth) : 'Not set'}
                className={styles.value} 
                readOnly 
                style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-ink-muted)' }}
              />
            </div>
            <button onClick={() => setEditMode(true)} className={styles.editButton} aria-label="Edit profile">
              <FontAwesomeIcon icon={faPenToSquare} />
            </button>
          </div>
        )}

        <div className={styles.budgetSection}>
          <h2>Set Overall Budget</h2>
          <div className={styles.budgetFormGroup}>
            <label htmlFor="budgetYear">Year:</label>
            <input
              type="number"
              id="budgetYear"
              name="year"
              value={overallBudget.year}
              onChange={handleBudgetChange}
            />
          </div>
          <div className={styles.budgetFormGroup}>
            <label htmlFor="budgetAmount">Amount:</label>
            <input
              type="number"
              id="budgetAmount"
              name="amount"
              value={overallBudget.amount}
              onChange={handleBudgetChange}
              min="0"
              step="0.01"
            />
          </div>
          <div className={styles.budgetFormGroup}>
            <label htmlFor="budgetCurrency">Currency:</label>
            <select
              id="budgetCurrency"
              name="currency"
              value={overallBudget.currency}
              onChange={handleBudgetChange}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="JPY">JPY</option>
              <option value="CNY">CNY</option>
            </select>
          </div>
          <div className={styles.budgetFormGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                id="budgetUnlimited"
                name="isLimited"
                checked={!overallBudget.isLimited}
                onChange={(e) => setOverallBudget(prev => ({
                  ...prev,
                  isLimited: !e.target.checked
                }))}
              />
              Unlimited Budget
            </label>
          </div>
          {budgetError && <p className={styles.error} role="alert">{budgetError}</p>}
          <button onClick={handleSetBudget} className={styles.setBudgetButton} disabled={!budgetReady}>
            {overallBudget._id ? 'Update Budget' : 'Set Budget'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
