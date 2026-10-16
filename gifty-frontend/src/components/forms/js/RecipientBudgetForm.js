import React, { useId } from 'react';
import { ModalActions } from '../../ui/Modal';
import Button from '../../ui/Button';
import { useForm } from 'react-hook-form';
import { formatMoney } from '../../../utils/money';
import { dateOnlyISO } from '../../../utils/dates';
import styles from '../css/RecipientBudgetForm.module.css';

// Only configuration is sent. Spending is derived on the server, the currency
// is the overall budget's, and a percentage budget's limit follows the
// overall budget, so it carries no minimum/maximum.
const toBudgetConfig = (data) => {
  const {
    recipient: _recipient,
    spentAmount: _spentAmount,
    currency: _currency,
    minimumAmount,
    maximumAmount,
    percentageAllocation,
    ...rest
  } = data;
  const config = { ...rest };
  const present = (value) => value !== undefined && value !== null && value !== '';
  if (data.allocationType === 'percentage') {
    if (present(percentageAllocation)) config.percentageAllocation = Number(percentageAllocation);
  } else {
    if (present(minimumAmount)) config.minimumAmount = Number(minimumAmount);
    if (present(maximumAmount)) config.maximumAmount = Number(maximumAmount);
  }
  return config;
};

// embedded: inside a dialog that already gives the backdrop and the title
const RecipientBudgetForm = ({ recipient, onClose, onSubmit, year, currency = 'USD', error = null, embedded = false }) => {
  const formId = useId();
  const budget = recipient.budget;
  const isNewBudget = !budget || budget.exists === false;

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      allocationType: budget?.allocationType || 'fixed',
      percentageAllocation: budget?.percentageAllocation || 0,
      minimumAmount: budget?.minimumAmount || 0,
      maximumAmount: budget?.maximumAmount || 0,
      // A new budget starts limited; an existing one keeps its setting
      isLimited: isNewBudget ? true : budget.isLimited !== false,
      notes: budget?.notes || '',
      frequency: budget?.frequency || 'yearly',
      category: budget?.category || 'gifts',
      // A new budget covers its whole year; an existing one keeps its dates
      startDate: budget?.startDate ? dateOnlyISO(budget.startDate) : (isNewBudget && year ? `${year}-01-01` : ''),
      endDate: budget?.endDate ? dateOnlyISO(budget.endDate) : (isNewBudget && year ? `${year}-12-31` : ''),
      giftStatus: isNewBudget ? 'active' : (recipient.giftStatus || 'active')
    }
  });

  const allocationType = watch('allocationType');

  const onSubmitForm = (data) => {
    onSubmit(toBudgetConfig(data));
  };

  const form = (
        <form id={formId} className={styles.budgetForm} onSubmit={handleSubmit(onSubmitForm)}>
          {!embedded && <h2 className={styles.formTitle}>Customize Budget for {recipient.firstName} {recipient.lastName}</h2>}
          {budget && budget.exists === false && <p>No budget yet for {year}.</p>}

          {/* Primary Budget Configuration */}
          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Primary Budget Configuration</h3>
            <div className={styles.sectionContent}>
              <div className={styles.formGroup}>
                <label htmlFor="allocationType">Allocation Type</label>
                <select id="allocationType" {...register('allocationType', { required: 'Allocation type is required' })}>
                  <option value="fixed">Fixed Amount</option>
                  <option value="percentage">Percentage of Overall Budget</option>
                </select>
                {errors.allocationType && <span className={styles.error}>{errors.allocationType.message}</span>}
              </div>

              {allocationType === 'percentage' ? (
                <div className={styles.formGroup}>
                  <label htmlFor="percentageAllocation">Budget Percentage</label>
                  <div className={styles.percentageInput}>
                    <input
                      id="percentageAllocation"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      {...register('percentageAllocation', {
                        required: 'Percentage allocation is required',
                        validate: (v) => Number(v) > 0 || 'Percentage must be greater than 0',
                        max: { value: 100, message: 'Percentage cannot exceed 100' }
                      })}
                    />
                    <span>%</span>
                  </div>
                  {errors.percentageAllocation && <span className={styles.error}>{errors.percentageAllocation.message}</span>}
                </div>
              ) : (
                <>
                  <div className={styles.formGroup}>
                    <label htmlFor="minimumAmount">Minimum Amount</label>
                    <input
                      id="minimumAmount"
                      type="number"
                      step="0.01"
                      {...register('minimumAmount', {
                        required: 'Minimum amount is required',
                        min: { value: 0, message: 'Amount must be positive' }
                      })}
                    />
                    {errors.minimumAmount && <span className={styles.error}>{errors.minimumAmount.message}</span>}
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="maximumAmount">Maximum Amount</label>
                    <input
                      id="maximumAmount"
                      type="number"
                      step="0.01"
                      {...register('maximumAmount', {
                        required: 'Maximum amount is required',
                        min: { value: 0, message: 'Amount must be positive' }
                      })}
                    />
                    {errors.maximumAmount && <span className={styles.error}>{errors.maximumAmount.message}</span>}
                  </div>
                </>
              )}
            </div>

            <div className={styles.checkboxGroup}>
              <input type="checkbox" id="isLimited" {...register('isLimited')} />
              <label htmlFor="isLimited">Enable Budget Limit</label>
            </div>
          </div>

          {/* Budget Status & Tracking */}
          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Budget Status & Tracking</h3>
            <div className={styles.sectionContent}>
              <div className={styles.formGroup}>
                <label htmlFor="giftStatus">Gift Status</label>
                <select
                  id="giftStatus"
                  {...register('giftStatus', { required: 'Gift status is required' })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="paused">Paused</option>
                  <option value="seasonal">Seasonal</option>
                </select>
                {errors.giftStatus && <span className={styles.error}>{errors.giftStatus.message}</span>}
              </div>

              {/* Spent is the sum of this year's purchases, computed by the server */}
              <div className={styles.formGroup}>
                <span id="spentThisYear">Spent in {year}</span>
                <p aria-labelledby="spentThisYear">{formatMoney(recipient.spent, currency)}</p>
              </div>
            </div>
          </div>

          {/* Timing & Frequency */}
          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Timing & Frequency</h3>
            <div className={styles.sectionContent}>
              <div className={styles.formGroup}>
                <label htmlFor="frequency">Frequency</label>
                <select id="frequency" {...register('frequency', { required: 'Frequency is required' })}>
                  <option value="yearly">Yearly</option>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="one-time">One-time</option>
                </select>
                {errors.frequency && <span className={styles.error}>{errors.frequency.message}</span>}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="startDate">Start Date</label>
                <input
                  id="startDate"
                  type="date"
                  {...register('startDate', { required: 'Start date is required' })}
                />
                {errors.startDate && <span className={styles.error}>{errors.startDate.message}</span>}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="endDate">End Date</label>
                <input id="endDate" type="date" {...register('endDate')} />
              </div>
            </div>
          </div>

          {/* Categorization & Notes */}
          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Categorization & Notes</h3>
            <div className={styles.sectionContent}>
              <div className={styles.formGroup}>
                <label htmlFor="category">Category</label>
                <select id="category" {...register('category', { required: 'Category is required' })}>
                  <option value="gifts">Gifts</option>
                  <option value="events">Events</option>
                  <option value="general">General</option>
                </select>
                {errors.category && <span className={styles.error}>{errors.category.message}</span>}
              </div>

              <div className={`${styles.formGroup} ${styles.notes}`}>
                <label htmlFor="notes">Notes</label>
                <textarea
                  id="notes"
                  {...register('notes')}
                  placeholder="Add any additional notes or reminders"
                />
              </div>
            </div>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <ModalActions className={styles.formActions}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" form={formId}>Save Budget</Button>
          </ModalActions>
        </form>
  );

  if (embedded) return form;

  return (
    <div className={styles.budgetFormOverlay}>
      <div className={styles.budgetFormContainer}>
        {form}
      </div>
    </div>
  );
};

export default RecipientBudgetForm;
