import React, { useState, useEffect, useId } from 'react';
import axiosInstance from '../../axiosInstance';
import { toast } from 'react-toastify';
import '../css/HolidaySettings.css';
import { ModalActions } from '../ui/Modal';
import Button from '../ui/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';

const MIN_DAYS = 1;
const MAX_DAYS = 30;

// One line saying what the save did to the holiday events
const describeHolidayUpdate = ({ created = 0, removed = 0, keptWithGifts = 0 }) => {
  const parts = [`${created} holiday${created === 1 ? '' : 's'} added`, `${removed} removed`];
  if (keptWithGifts > 0) parts.push(`${keptWithGifts} kept because they have gifts`);
  return `Holiday settings saved: ${parts.join(', ')}.`;
};

const HolidaySettings = ({ onSettingsChange }) => {
  const formId = useId();
  const [loading, setLoading] = useState(false);
  // null until the saved settings arrive: saving the defaults instead would
  // replace the user's country and categories
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState(false);

  // Countries supported in the system
  const countries = [
    { code: 'US', name: 'United States' },
    { code: 'DE', name: 'Germany' },
    // Add more countries as they're supported in the backend
  ];

  // Holiday categories
  const categories = [
    { id: 'national', label: 'National Holidays' },
    { id: 'religious', label: 'Religious Observances' },
    { id: 'cultural', label: 'Cultural Celebrations' },
    { id: 'international', label: 'International Days' }
  ];

  // Start from the saved settings
  useEffect(() => {
    let cancelled = false;
    axiosInstance.get('/settings/user-preferences')
      .then((response) => {
        if (cancelled) return;
        const saved = response.data?.holidaySettings || {};
        setSettings({
          enabled: saved.enabled ?? true,
          categories: saved.categories || ['national', 'cultural'],
          countryCode: saved.countryCode || 'US',
          defaultRemindDaysBefore: saved.defaultRemindDaysBefore ?? 7
        });
      })
      .catch((error) => {
        console.error('Error loading holiday settings:', error);
        if (!cancelled) setLoadError(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Handle changes to form inputs
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      if (name === 'enabled') {
        // For the main enabled toggle
        setSettings(prev => ({ ...prev, enabled: checked }));
      } else {
        // For category checkboxes
        setSettings(prev => {
          const updatedCategories = checked
            ? [...prev.categories, name]
            : prev.categories.filter(cat => cat !== name);
          
          return { ...prev, categories: updatedCategories };
        });
      }
    } else {
      // For select and number inputs; an emptied number box stays empty
      // until it is filled in again
      setSettings(prev => ({ 
        ...prev, 
        [name]: name === 'defaultRemindDaysBefore' && value !== '' ? parseInt(value, 10) : value
      }));
    }
  };

  // Increment/decrement reminder days
  const adjustDays = (increment) => {
    setSettings(prev => {
      const newValue = (Number(prev.defaultRemindDaysBefore) || 0) + (increment ? 1 : -1);
      const clampedValue = Math.min(Math.max(newValue, MIN_DAYS), MAX_DAYS);
      return { ...prev, defaultRemindDaysBefore: clampedValue };
    });
  };

  // Save settings to backend
  const handleSubmit = async (e) => {
    e.preventDefault();
    const days = settings.defaultRemindDaysBefore;
    if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) {
      toast.error(`Reminder days must be a whole number between ${MIN_DAYS} and ${MAX_DAYS}.`);
      return;
    }
    setLoading(true);

    try {
      const response = await axiosInstance.put('/users/preferences', {
        preferences: {
          holidaySettings: settings
        }
      });

      const holidays = response.data?.holidays;
      if (holidays && !holidays.success) {
        toast.error('Your settings were saved, but the holiday events could not be updated. Try "Refresh Holidays" on the home page.');
      } else if (holidays) {
        toast.success(describeHolidayUpdate(holidays));
      } else {
        toast.success('Holiday settings saved.');
      }

      if (onSettingsChange) {
        onSettingsChange(response.data?.preferences);
      }
    } catch (error) {
      console.error('Error updating holiday settings:', error);
      toast.error(error.response?.data?.message || 'Failed to update holiday settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loadError) {
    return (
      <div className="holiday-settings">
        <h3>Holiday Reminders</h3>
        <p className="form-hint">Could not load your holiday settings. Close this window and try again.</p>
      </div>
    );
  }

  if (!settings) {
    return <div className="holiday-settings">Loading holiday settings...</div>;
  }

  return (
    <div className="holiday-settings">
      <h3>Holiday Reminders</h3>
      
      <form id={formId} onSubmit={handleSubmit}>
        {/* Main toggle switch */}
        <div className="toggle-wrapper">
          <label htmlFor="holiday-enabled" className="toggle-label">
            Enable Holiday Reminders
          </label>
          <div className="toggle-container">
            <input
              type="checkbox"
              name="enabled"
              id="holiday-enabled"
              checked={settings.enabled}
              onChange={handleChange}
              className="toggle-checkbox"
            />
            <span className="toggle-slider"></span>
          </div>
        </div>

        {/* Only show other settings if enabled */}
        {settings.enabled && (
          <>
            {/* Country selection */}
            <div className="form-group">
              <label htmlFor="countryCode">Country for Holidays</label>
              <select
                id="countryCode"
                name="countryCode"
                value={settings.countryCode}
                onChange={handleChange}
              >
                {countries.map(country => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
              <p className="form-hint">
                Holiday reminders will be based on this country's calendar
              </p>
            </div>

            {/* Categories checkboxes */}
            <div className="categories-section">
              <label className="categories-title">Holiday Categories</label>
              <div className="category-list">
                {categories.map(category => (
                  <div key={category.id} className="category-item">
                    <input
                      type="checkbox"
                      id={`category-${category.id}`}
                      name={category.id}
                      checked={settings.categories.includes(category.id)}
                      onChange={handleChange}
                      className="category-checkbox"
                    />
                    <span className="custom-checkbox"></span>
                    <label htmlFor={`category-${category.id}`} className="category-label">
                      {category.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Reminder days setting */}
            <div className="reminder-days">
              <label htmlFor="defaultRemindDaysBefore">Reminder Days Before</label>
              <div className="number-input-container">
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label="Decrease reminder days"
                  aria-controls="defaultRemindDaysBefore"
                  onClick={() => adjustDays(false)}
                >
                  <FontAwesomeIcon icon={faMinus} aria-hidden="true" />
                </button>
                <input
                  type="number"
                  id="defaultRemindDaysBefore"
                  name="defaultRemindDaysBefore"
                  min={MIN_DAYS}
                  max={MAX_DAYS}
                  value={settings.defaultRemindDaysBefore}
                  onChange={handleChange}
                  className="number-input"
                />
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label="Increase reminder days"
                  aria-controls="defaultRemindDaysBefore"
                  onClick={() => adjustDays(true)}
                >
                  <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
                </button>
              </div>
              <p className="form-hint">
                How many days before each holiday you'll receive a reminder
              </p>
            </div>
          </>
        )}

        <p className="form-hint">
          Saving adds the holidays you chose and removes upcoming holiday events you no longer want.
          Past holidays, holidays with gifts, and events you made yourself are kept.
        </p>

        {/* Submit button */}
        <ModalActions className="form-actions">
          <Button type="submit" form={formId} loading={loading}>
            {loading ? 'Saving...' : 'Save Settings'}
          </Button>
        </ModalActions>
      </form>
    </div>
  );
};

export default HolidaySettings;