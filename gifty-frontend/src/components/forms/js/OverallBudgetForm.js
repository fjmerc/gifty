import React, { useId } from 'react';
import { ModalActions } from '../../ui/Modal';
import Button from '../../ui/Button';
import { useForm } from 'react-hook-form';
import styles from '../css/OverallBudgetForm.module.css';

const OverallBudgetForm = ({ budget, onClose, onSubmit, year, error = null, showTitle = true }) => {
  const formId = useId();
  // An API view with exists:false is "no budget yet", not a $0 budget
  const existing = budget && budget.exists !== false ? budget : null;
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      amount: existing?.amount ?? 0,
      isLimited: existing?.isLimited === true,
      currency: budget?.currency || 'USD',
      notes: existing?.notes || ''
    }
  });

  const isLimited = watch('isLimited');

  const onSubmitForm = (data) => {
    onSubmit({
      ...data,
      year
    });
  };

  return (
    <form id={formId} className={styles['event-form']} onSubmit={handleSubmit(onSubmitForm)}>
      {showTitle && <h2>Set Overall Budget for {year}</h2>}

      <div className={styles.checkboxGroup}>
        <input type="checkbox" id="isLimited" {...register('isLimited')} />
        <label htmlFor="isLimited">Enable Budget Limit</label>
      </div>

      {isLimited && (
        <div className={styles['form-group']}>
          <label htmlFor="amount">Budget Amount</label>
          <input
            id="amount"
            type="number"
            step="0.01"
            {...register('amount', {
              required: 'Amount is required when budget is limited',
              min: { value: 0, message: 'Amount must be positive' }
            })}
          />
          {errors.amount && <span className={styles.error}>{errors.amount.message}</span>}
        </div>
      )}

      <div className={styles['form-group']}>
        <label htmlFor="currency">Currency</label>
        <select
          id="currency"
          {...register('currency', { required: 'Currency is required' })}
        >
          <option value="USD">USD ($)</option>
          <option value="EUR">EUR (€)</option>
          <option value="GBP">GBP (£)</option>
          <option value="JPY">JPY (¥)</option>
          <option value="CNY">CNY (¥)</option>
        </select>
        {errors.currency && <span className={styles.error}>{errors.currency.message}</span>}
      </div>

      <div className={styles['form-group']}>
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          {...register('notes')}
          placeholder="Add any additional notes or reminders"
        />
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <ModalActions className={styles['form-actions']}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={formId}>Save Budget</Button>
      </ModalActions>
    </form>
  );
};

export default OverallBudgetForm;
