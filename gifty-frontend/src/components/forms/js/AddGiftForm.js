import React, { useState, useEffect, useCallback, useMemo, useId, useRef } from 'react';
import { ModalActions } from '../../ui/Modal';
import Button from '../../ui/Button';
import { budgetLeftLabel, wouldExceed } from '../../../utils/money';
import { todayLocalISO, localDateISO, dateOnlyISO, formatDateOnly } from '../../../utils/dates';
import styles from '../css/AddGiftForm.module.css';

// `budgets` is /budgets/all recipientBudgets: one entry per recipient with
// this year's server-computed { spent, left, status, limit }.
// Editing keeps the gift's own recipient and event selectable when the
// pickers no longer list them (an archived recipient, a past event)
const withCurrent = (options, current) =>
  current?._id && !options.some(option => option._id === current._id) ? [...options, current] : options;

// `events` is every event of the user (GET /events). A gift's event is one of
// its recipient's own events or a holiday (shared, system-generated). Past
// events stay offered for a year: a gift is often logged after the day.
const PAST_DAYS = 365;
const recipientIdOf = (event) => (event.recipient && typeof event.recipient === 'object'
  ? event.recipient._id
  : event.recipient);
const eventsFor = (events, recipientId) => {
  if (!recipientId) return [];
  const today = todayLocalISO();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PAST_DAYS);
  const oldest = todayLocalISO(cutoff);
  const mine = (events || [])
    .filter(event => event.isSystemGenerated || recipientIdOf(event) === recipientId)
    .map(event => ({ event, day: dateOnlyISO(event.date) }))
    .filter(({ day }) => !day || day >= oldest);
  // A repeating series stores every occurrence: offer its next one and its
  // latest past one, not a year of weekly entries
  const onePerSeries = (list) => {
    const seen = new Set();
    return list.filter(({ event }) => {
      if (!event.series) return true;
      if (seen.has(event.series)) return false;
      seen.add(event.series);
      return true;
    });
  };
  const upcoming = onePerSeries(mine.filter(({ day }) => day && day >= today).sort((a, b) => a.day.localeCompare(b.day)));
  const past = onePerSeries(mine.filter(({ day }) => day && day < today).sort((a, b) => b.day.localeCompare(a.day)));
  const undated = mine.filter(({ day }) => !day);
  return [...upcoming, ...past, ...undated].map(({ event }) => event);
};
const eventLabel = (event) => (event.date ? `${event.name} — ${formatDateOnly(event.date)}` : event.name);

// In form order: the first one missing gets the focus
const REQUIRED_FIELDS = ['name', 'description', 'recipientId', 'eventId', 'price'];
const validate = (data) => {
  const errors = {};
  if (!String(data.name ?? '').trim()) errors.name = 'Enter a gift name.';
  if (!String(data.description ?? '').trim()) errors.description = 'Enter a description.';
  if (!data.recipientId) errors.recipientId = 'Choose who the gift is for.';
  // The event picker opens once a recipient is chosen
  else if (!data.eventId) errors.eventId = 'Choose an event.';
  if (data.price === '' || data.price === null || data.price === undefined) errors.price = 'Enter a price.';
  else if (!(parseFloat(data.price) >= 0)) errors.price = 'Enter a price of 0 or more.';
  return errors;
};

const AddGiftForm = ({ onSubmit, onCancel, initialData, recipients, events, budgets, currency = 'USD' }) => {
  const formId = useId();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    recipientId: '',
    eventId: '',
    purchaseDate: '',
    favorite: false,
    status: 'suggestion',
    category: '',
    // Edited as comma-separated text; split into arrays on submit
    tags: '',
    priceRange: {
      min: '',
      max: ''
    },
    whereToBuy: ''
  });

  const [errors, setErrors] = useState({});
  const fieldRefs = useRef({});
  const fieldRef = (field) => (element) => { fieldRefs.current[field] = element; };
  const errorId = (field) => `${formId}-${field}-error`;
  const invalidProps = (field) => (errors[field]
    ? { 'aria-invalid': true, 'aria-describedby': errorId(field) }
    : {});
  const fieldError = (field) => errors[field] && (
    <span id={errorId(field)} className={styles.fieldError}>{errors[field]}</span>
  );

  const [selectedRecipientBudget, setSelectedRecipientBudget] = useState(null);
  const recipientOptions = withCurrent(recipients, initialData?.recipient);
  // Editing keeps the gift's own event offered while it stays with its own
  // recipient (or the event is a holiday), even when the event is long past
  const keptEvent = useCallback((recipientId) => {
    const current = initialData?.event;
    if (!current?._id) return null;
    const ownRecipient = initialData.recipient?._id === recipientId;
    const holiday = current.isSystemGenerated || (events || []).some(event => event._id === current._id && event.isSystemGenerated);
    return ownRecipient || holiday ? current : null;
  }, [initialData, events]);
  const optionsFor = useCallback(
    (recipientId) => withCurrent(eventsFor(events, recipientId), keptEvent(recipientId)),
    [events, keptEvent]
  );
  const eventOptions = useMemo(() => optionsFor(formData.recipientId), [optionsFor, formData.recipientId]);

  const updateSelectedBudget = useCallback((recipientId) => {
    if (!budgets || !recipientId) {
      setSelectedRecipientBudget(null);
      return;
    }
    setSelectedRecipientBudget(budgets.find(entry => entry._id === recipientId) || null);
  }, [budgets]);

  useEffect(() => {
    if (initialData) {
      // Convert tags and whereToBuy to strings for easier editing if they exist
      const tagsString = initialData.tags && Array.isArray(initialData.tags)
        ? initialData.tags.join(', ')
        : '';

      const whereToBuyString = initialData.whereToBuy && Array.isArray(initialData.whereToBuy)
        ? initialData.whereToBuy.join(', ')
        : '';

      setFormData({
        ...initialData,
        recipientId: initialData.recipient._id,
        eventId: initialData.event._id,
        // A date input needs YYYY-MM-DD: the local day the purchase happened
        purchaseDate: localDateISO(initialData.purchaseDate),
        tags: tagsString,
        whereToBuy: whereToBuyString,
        priceRange: {
          min: initialData.priceRange?.min || '',
          max: initialData.priceRange?.max || ''
        }
      });
      updateSelectedBudget(initialData.recipient._id);
    }
  }, [initialData, budgets, updateSelectedBudget]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: type === 'checkbox' ? checked : value,
      // Another recipient: drop an event that isn't theirs (holidays stay)
      ...(name === 'recipientId'
        && !optionsFor(value).some(event => event._id === prevData.eventId)
        && { eventId: '' }),
      // Marking a gift purchased defaults its date to today (local calendar day)
      ...(name === 'status' && value === 'purchased' && !prevData.purchaseDate && { purchaseDate: todayLocalISO() })
    }));

    if (errors[name]) {
      setErrors(({ [name]: _cleared, ...rest }) => rest);
    }
    if (name === 'recipientId') {
      updateSelectedBudget(value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const found = validate(formData);
    setErrors(found);
    const firstInvalid = REQUIRED_FIELDS.find(field => found[field]);
    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus();
      return;
    }

    // Process tags and whereToBuy from strings to arrays
    const tagsArray = formData.tags
      ? formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
      : [];

    const whereToBuyArray = formData.whereToBuy
      ? formData.whereToBuy.split(',').map(place => place.trim()).filter(place => place)
      : [];

    const submissionData = {
      ...formData,
      price: parseFloat(formData.price),
      tags: tagsArray,
      whereToBuy: whereToBuyArray,
      priceRange: {
        min: formData.priceRange.min ? parseFloat(formData.priceRange.min) : null,
        max: formData.priceRange.max ? parseFloat(formData.priceRange.max) : null
      }
    };

    // purchaseDate is a date-only value the server reads in its time zone;
    // it only means something for a purchased gift
    if (submissionData.status === 'purchased') {
      if (!submissionData.purchaseDate) {
        submissionData.purchaseDate = todayLocalISO();
      }
      const unchangedDate = initialData?.status === 'purchased'
        && submissionData.purchaseDate === localDateISO(initialData.purchaseDate);
      if (unchangedDate) {
        delete submissionData.purchaseDate;
      }
    } else {
      delete submissionData.purchaseDate;
    }

    onSubmit(submissionData);
  };

  const getBudgetDisplay = () => {
    const label = budgetLeftLabel(selectedRecipientBudget, currency);
    if (label === 'No budget') {
      return <span className={styles.noBudget}>No budget</span>;
    }
    return label;
  };

  const isPriceOverBudget = () => {
    if (!selectedRecipientBudget || !formData.price) {
      return false;
    }
    // Editing an already-purchased gift for the same recipient: its price is already in Spent
    const alreadyCounted = initialData?.status === 'purchased' && initialData.recipient?._id === formData.recipientId
      ? initialData.price
      : 0;
    return wouldExceed(formData.price, selectedRecipientBudget.left, alreadyCounted);
  };

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate aria-label={initialData ? 'Edit Gift' : 'Add New Gift'}>
      <p className="required-legend">Fields marked * are required.</p>
      <div className={styles.formGroup}>
        <label htmlFor="name" className="required">Gift Name</label>
        <input
          type="text"
          id="name"
          ref={fieldRef('name')}
          {...invalidProps('name')}
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          placeholder="Enter gift name"
        />
        {fieldError('name')}
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="description" className="required">Description</label>
        <textarea
          id="description"
          ref={fieldRef('description')}
          {...invalidProps('description')}
          name="description"
          value={formData.description}
          onChange={handleChange}
          required
          placeholder="Enter description"
        />
        {fieldError('description')}
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="category">Category</label>
        <input
          type="text"
          id="category"
          name="category"
          value={formData.category}
          onChange={handleChange}
          placeholder="E.g., Electronics, Books, Fashion"
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="tags">Tags (comma separated)</label>
        <input
          type="text"
          id="tags"
          name="tags"
          value={formData.tags}
          onChange={handleChange}
          placeholder="E.g., handmade, personalized, sustainable"
        />
      </div>
      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label htmlFor="recipientId" className="required">Recipient</label>
          <select
            id="recipientId"
          ref={fieldRef('recipientId')}
          {...invalidProps('recipientId')}
            name="recipientId"
            value={formData.recipientId}
            onChange={handleChange}
            required
          >
            <option value="">Select a Recipient</option>
            {recipientOptions.map(recipient => (
              <option key={recipient._id} value={recipient._id}>
                {recipient.firstName} {recipient.lastName}
              </option>
            ))}
          </select>
          {fieldError('recipientId')}
          {formData.recipientId && (
            <div className={styles.budgetInfo}>
              Budget: {getBudgetDisplay()}
            </div>
          )}
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="eventId" className="required">Event</label>
          <select
            id="eventId"
          ref={fieldRef('eventId')}
          {...invalidProps('eventId')}
            name="eventId"
            value={formData.eventId}
            onChange={handleChange}
            required
            disabled={!formData.recipientId}
          >
            <option value="">{formData.recipientId ? 'Select an Event' : 'Select a recipient first'}</option>
            {eventOptions.map(event => (
              <option key={event._id} value={event._id}>{eventLabel(event)}</option>
            ))}
          </select>
          {fieldError('eventId')}
        </div>
      </div>
      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label htmlFor="price" className="required">Price</label>
          <input
            type="number"
            id="price"
            ref={fieldRef('price')}
            {...invalidProps('price')}
            name="price"
            value={formData.price}
            onChange={handleChange}
            required
            min="0"
            step="0.01"
            className={isPriceOverBudget() ? styles.priceOverBudget : ''}
            placeholder="Enter price"
          />
          {fieldError('price')}
          {isPriceOverBudget() && (
            <div className={styles.overBudgetWarning}>
              Warning: Price is more than this recipient's budget left
            </div>
          )}
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="purchaseDate" className={formData.status === 'purchased' ? 'required' : undefined}>Purchase Date</label>
          <input
            type="date"
            id="purchaseDate"
            name="purchaseDate"
            value={formData.purchaseDate}
            onChange={handleChange}
            required={formData.status === 'purchased'}
          />
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label htmlFor="priceRangeMin">Price Range (Min)</label>
          <input
            type="number"
            id="priceRangeMin"
            name="priceRange.min"
            value={formData.priceRange.min}
            onChange={(e) => {
              setFormData({
                ...formData,
                priceRange: {
                  ...formData.priceRange,
                  min: e.target.value
                }
              });
            }}
            min="0"
            step="0.01"
            placeholder="Min price"
          />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="priceRangeMax">Price Range (Max)</label>
          <input
            type="number"
            id="priceRangeMax"
            name="priceRange.max"
            value={formData.priceRange.max}
            onChange={(e) => {
              setFormData({
                ...formData,
                priceRange: {
                  ...formData.priceRange,
                  max: e.target.value
                }
              });
            }}
            min="0"
            step="0.01"
            placeholder="Max price"
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="whereToBuy">Where to Buy (comma separated)</label>
        <input
          type="text"
          id="whereToBuy"
          name="whereToBuy"
          value={formData.whereToBuy}
          onChange={handleChange}
          placeholder="E.g., Amazon, Target, Best Buy"
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="status" className="required">Status</label>
        <select
          id="status"
          name="status"
          value={formData.status}
          onChange={handleChange}
          required
        >
          <option value="suggestion">Suggestion</option>
          <option value="saved">Saved</option>
          <option value="purchased">Purchased</option>
          <option value="ignored">Ignored</option>
        </select>
      </div>
      <div className={`${styles.formGroup} ${styles.checkboxGroup}`}>
        <label>
          <input
            type="checkbox"
            name="favorite"
            checked={formData.favorite}
            onChange={handleChange}
          />
          Favorite
        </label>
      </div>
      <ModalActions className={styles.formActions}>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" form={formId}>
          {initialData ? 'Update Gift' : 'Add Gift'}
        </Button>
      </ModalActions>
    </form>
  );
};

export default AddGiftForm;
