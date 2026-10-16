import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../../axiosInstance';
import styles from '../css/EditOverallBudget.module.css';

// The form edits configuration only; every figure is derived on the server.
// A view with exists:false is a budget still to be created: start it limited
// so the amount the user types means something.
const toFormState = (data) => ({
  exists: data?.exists !== false,
  amount: data?.amount ?? '',
  isLimited: data?.exists === false ? true : data?.isLimited !== false,
  currency: data?.currency || 'USD',
  notes: data?.notes || ''
});

const AMOUNT_ERROR = 'Enter a budget amount greater than 0, or mark it Unlimited';

const EditOverallBudget = () => {
  const { year } = useParams();
  const navigate = useNavigate();
  const [budget, setBudget] = useState(toFormState(null));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    const fetchBudget = async () => {
      try {
        const response = await axiosInstance.get(`/budgets/overall/${year}`);
        setBudget(toFormState(response.data));
        setLoading(false);
      } catch (err) {
        console.error('Error fetching budget:', err);
        setLoadError('Failed to load budget. Please try again.');
        setLoading(false);
      }
    };

    fetchBudget();
  }, [year]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setBudget(prev => ({
      ...prev,
      [name]: type === 'checkbox'
        ? !checked
        : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // The amount stays the raw input text; it is converted only here
    const amount = budget.amount === '' ? NaN : Number(budget.amount);
    if (budget.isLimited && !(amount > 0)) {
      setSubmitError(AMOUNT_ERROR);
      return;
    }
    try {
      setSubmitError(null);
      const payload = {
        isLimited: budget.isLimited,
        currency: budget.currency,
        notes: budget.notes
      };
      if (Number.isFinite(amount) && amount >= 0) payload.amount = amount;
      await axiosInstance.put(`/budgets/overall/${year}`, payload);
      navigate('/budgets');
    } catch (err) {
      console.error('Error updating budget:', err);
      setSubmitError(err.response?.data?.message || 'Failed to update budget. Please try again.');
    }
  };

  const handleCancel = () => {
    navigate('/budgets');
  };

  if (loading) return <div className={styles.loading}>Loading...</div>;
  if (loadError) return <div className={styles.error}>{loadError}</div>;

  return (
    <div className={styles.editBudgetPage}>
      <div className={styles.container}>
        <div className={styles.editBudget}>
          <h1>{budget.exists ? 'Edit' : 'Set'} Overall Budget for {year}</h1>
          {submitError && <div className={styles.error} role="alert">{submitError}</div>}
          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.formGroup}>
              <label htmlFor="amount">Amount:</label>
              <input
                type="number"
                id="amount"
                name="amount"
                value={budget.amount}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                required={budget.isLimited}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="currency">Currency:</label>
              <select
                id="currency"
                name="currency"
                value={budget.currency}
                onChange={handleInputChange}
                required
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="JPY">JPY</option>
                <option value="CNY">CNY</option>
              </select>
            </div>
            <div className={styles.checkboxGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  id="isLimited"
                  name="isLimited"
                  checked={!budget.isLimited}
                  onChange={handleInputChange}
                />
                Unlimited Budget
              </label>
            </div>
            <div className={styles.buttonGroup}>
              <button type="submit" className={styles.submitButton}>
                {budget.exists ? 'Update Budget' : 'Save Budget'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditOverallBudget;
