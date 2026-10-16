import React, { useState, useEffect, useCallback, useId } from 'react';
import { ModalActions } from '../../ui/Modal';
import Button from '../../ui/Button';
import { useForm, Controller } from 'react-hook-form';
import axiosInstance from '../../../axiosInstance';
import styles from '../css/EventForm.module.css';

const EventForm = ({ event, onClose, onSubmit, isEditing, showTitle = true }) => {
  const formId = useId();
  const [systemEventTypes, setSystemEventTypes] = useState([]);
  const [customEventTypes, setCustomEventTypes] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [isReminderSet, setIsReminderSet] = useState(false);
  const [saveError, setSaveError] = useState('');
  const { register, control, handleSubmit, watch, reset, formState: { errors } } = useForm();

  const recurringFrequency = watch('recurring.frequency');

  // Errors of nested fields ('recurring.until') are nested objects
  const errorOf = (field) => field.split('.').reduce((nested, key) => nested?.[key], errors);
  const errorId = (field) => `${formId}-${field.replace('.', '-')}-error`;
  const invalidProps = (field) => (errorOf(field)
    ? { 'aria-invalid': true, 'aria-describedby': errorId(field) }
    : {});
  const fieldError = (field) => errorOf(field) && (
    <span id={errorId(field)} className={styles['error']}>{errorOf(field).message}</span>
  );

  const fetchEventTypes = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/eventTypes');
      
      // Separate system and custom event types
      const systemTypes = response.data.filter(type => !type.isCustom);
      const customTypes = response.data.filter(type => type.isCustom);
      
      // Sort both system and custom event types alphabetically by name
      const sortedSystemTypes = systemTypes.sort((a, b) => a.name.localeCompare(b.name));
      const sortedCustomTypes = customTypes.sort((a, b) => a.name.localeCompare(b.name));
      
      setSystemEventTypes(sortedSystemTypes);
      setCustomEventTypes(sortedCustomTypes);
    } catch (error) {
      console.error('Error fetching event types:', error);
    }
  }, []);

  const fetchRecipients = useCallback(async () => {
    try {
      // Use the new endpoint that includes system accounts
      const response = await axiosInstance.get('/recipients/all-including-system');
      
      // Sort recipients alphabetically by firstName and lastName
      const sortedRecipients = response.data.sort((a, b) => {
        // First compare by firstName
        const firstNameComparison = a.firstName.localeCompare(b.firstName);
        // If firstNames are the same, compare by lastName
        return firstNameComparison !== 0 ? firstNameComparison : a.lastName.localeCompare(b.lastName);
      });
      
      setRecipients(sortedRecipients);
    } catch (error) {
      console.error('Error fetching recipients:', error);
    }
  }, []);

  useEffect(() => {
    fetchEventTypes();
    fetchRecipients();
  }, [fetchEventTypes, fetchRecipients]);

  useEffect(() => {
    if (event) {
      const reminderIsSet = event.reminder?.isSet || false;
      setIsReminderSet(reminderIsSet);
      // Convert UTC ISO date strings back to local timezone for display
      const convertToLocalTime = (isoString) => {
        if (!isoString) return '';
        const date = new Date(isoString);
        // Format as YYYY-MM-DDThh:mm (format required by datetime-local input)
        return new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
          .toISOString()
          .slice(0, 16);
      };

      reset({
        name: event.name || '',
        date: event.date ? new Date(event.date).toISOString().split('T')[0] : '',
        type: event.type?._id || event.type || '',
        recipient: event.recipient?._id || event.recipient || '',
        recurring: {
          frequency: event.recurring?.frequency || 'None',
          until: event.recurring?.until ? new Date(event.recurring.until).toISOString().split('T')[0] : '',
          // Stored as timestamps; date inputs need YYYY-MM-DD
          exceptions: (event.recurring?.exceptions || []).map((d) => String(d).slice(0, 10))
        },
        reminder: {
          isSet: reminderIsSet,
          time: reminderIsSet && event.reminder?.time 
            ? convertToLocalTime(event.reminder.time)
            : '',
          method: event.reminder?.method || 'Email'
        }
      });
    }
  }, [event, reset]);

  const onSubmitForm = async (data) => {
    const eventData = {
      ...data,
      recurring: {
        frequency: data.recurring.frequency,
        until: data.recurring.frequency !== 'None' ? data.recurring.until : null,
        exceptions: data.recurring.frequency !== 'None' ? data.recurring.exceptions : []
      },
      // The input holds this browser's wall-clock time: send the instant,
      // or the server would read it in its own time zone
      reminder: isReminderSet && data.reminder.time
        ? {
            isSet: true,
            time: new Date(data.reminder.time).toISOString(),
            method: data.reminder.method
          }
        : { isSet: false, time: null, method: null }
    };
  
    try {
      setSaveError('');
      if (isEditing) {
        await axiosInstance.put(`/events/${event._id}`, eventData);
      } else {
        await axiosInstance.post('/events', eventData);
      }
      onSubmit();
      onClose();
    } catch (error) {
      setSaveError(error.response?.data?.message || 'Saving the event failed. Please try again.');
    }
  };

  // An event kept for an archived recipient (it holds purchases) still
  // shows them; the picker only lists active recipients
  const current = event?.recipient && typeof event.recipient === 'object' ? event.recipient : null;
  const recipientOptions = current?._id && !recipients.some(recipient => recipient._id === current._id)
    ? [...recipients, { ...current, archived: true }]
    : recipients;

  return (
    <form id={formId} className={styles['event-form']} onSubmit={handleSubmit(onSubmitForm)}>
      {showTitle && <h2>{isEditing ? 'Edit Event' : 'Create New Event'}</h2>}
      <p className="required-legend">Fields marked * are required.</p>
      
      <div className={styles['form-group']}>
        <label htmlFor="name" className="required">Event Name</label>
        <input id="name" aria-required="true" {...invalidProps('name')} {...register('name', { required: 'Event name is required' })} />
        {fieldError('name')}
      </div>

      <div className={styles['two-column']}>
        <div className={styles['form-group']}>
          <label htmlFor="recipient" className="required">Recipient</label>
          <select 
            id="recipient" 
            aria-required="true"
            {...invalidProps('recipient')}
            {...register('recipient', { required: 'Recipient is required' })}
            value={watch('recipient') || ''}>
            <option value="">Select a recipient</option>
            {recipientOptions.map(recipient => (
              <option 
                key={recipient._id} 
                value={recipient._id}
                className={recipient.isSystemAccount ? 'system-account' : ''}
              >
                {recipient.firstName} {recipient.lastName}
                {recipient.isSystemAccount ? ' (System)' : ''}
                {recipient.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
          {fieldError('recipient')}
        </div>

        <div className={styles['form-group']}>
          <label htmlFor="type" className="required">Event Type</label>
          <select 
            id="type" 
            aria-required="true"
            {...invalidProps('type')}
            {...register('type', { required: 'Event type is required' })}
            value={watch('type') || ''}>
            <option value="">Select an event type</option>
            
            {/* System Event Types */}
            <optgroup label="System Event Types">
              {systemEventTypes.map(type => (
                <option key={type._id} value={type._id}>{type.name}</option>
              ))}
            </optgroup>
            
            {/* Custom Event Types - only show if there are any */}
            {customEventTypes.length > 0 && (
              <optgroup label="Custom Event Types">
                {customEventTypes.map(type => (
                  <option key={type._id} value={type._id}>{type.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          {fieldError('type')}
        </div>
      </div>

      <div className={styles['form-group']}>
        <label htmlFor="date" className="required">Date</label>
        <input id="date" type="date" aria-required="true" {...invalidProps('date')} {...register('date', { required: 'Date is required' })} />
        {fieldError('date')}
      </div>
      
      <div className={styles['recurring-section']}>
        <div className={styles['section-title']}>Recurring Settings</div>
        <div className={styles['two-column']}>
          <div className={styles['form-group']}>
            <label htmlFor="recurring.frequency">Frequency</label>
            <select id="recurring.frequency" {...register('recurring.frequency')}>
              <option value="None">None</option>
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
              <option value="Yearly">Yearly</option>
            </select>
          </div>

          {recurringFrequency !== 'None' && (
            <div className={styles['form-group']}>
              <label htmlFor="recurring.until">Recur Until</label>
              <input 
                id="recurring.until" 
                type="date" 
                {...invalidProps('recurring.until')}
                {...register('recurring.until', { required: 'Recur until date is required' })} 
              />
              {fieldError('recurring.until')}
            </div>
          )}
        </div>

        {recurringFrequency !== 'None' && (
          <div className={styles['form-group']}>
            <label>Exceptions</label>
            <Controller
              name="recurring.exceptions"
              control={control}
              defaultValue={[]}
              render={({ field }) => (
                <div>
                  {field.value.map((exception, index) => (
                    <div key={index} className={styles['exception-item']}>
                      <input 
                        type="date" 
                        value={exception}
                        onChange={(e) => {
                          const newExceptions = [...field.value];
                          newExceptions[index] = e.target.value;
                          field.onChange(newExceptions);
                        }}
                      />
                      <button type="button" onClick={() => {
                        const newExceptions = field.value.filter((_, i) => i !== index);
                        field.onChange(newExceptions);
                      }}>Remove</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => field.onChange([...field.value, ''])}>
                    Add Exception
                  </button>
                </div>
              )}
            />
          </div>
        )}
      </div>

      <div className={styles['reminder-section']}>
        <div className={styles['checkbox-group']}>
          <label>
            <input
              type="checkbox"
              checked={isReminderSet}
              onChange={(e) => {
                setIsReminderSet(e.target.checked);
                if (!e.target.checked) {
                  reset({
                    ...watch(),
                    reminder: { isSet: false, time: '', method: 'Email' }
                  });
                } else {
                  reset({
                    ...watch(),
                    reminder: { isSet: true, time: '', method: 'Email' }
                  });
                }
              }}
            />
            Set Reminder
          </label>
        </div>

        {isReminderSet && (
          <div className={styles['two-column']}>
            <div className={styles['form-group']}>
              <label htmlFor="reminder.time">Reminder Time</label>
              <input
                id="reminder.time"
                type="datetime-local"
                {...invalidProps('reminder.time')}
                {...register('reminder.time', {
                  required: 'Reminder time is required',
                  validate: (value) => !Number.isNaN(new Date(value).getTime()) || 'Enter a valid date and time'
                })}
              />
              {fieldError('reminder.time')}
            </div>

            <div className={styles['form-group']}>
              <label htmlFor="reminder.method">Reminder Method</label>
              <select id="reminder.method" {...register('reminder.method')}>
                <option value="Email">Email</option>
                <option value="Push Notification">Push Notification</option>
                <option value="SMS">SMS</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {saveError && <p role="alert" className={styles['error']}>{saveError}</p>}

      <ModalActions className={styles['form-actions']}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={formId}>Save Event</Button>
      </ModalActions>
    </form>
  );
};

export default EventForm;
