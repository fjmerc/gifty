import React, { useState, useId } from 'react';
import { ModalActions } from '../../ui/Modal';
import Button from '../../ui/Button';
import { useForm } from 'react-hook-form';
import axiosInstance from '../../../axiosInstance';
import styles from '../css/CustomEventTypeForm.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';

// showHeader={false} when a dialog around the form already gives the title and Close
const CustomEventTypeForm = ({ onClose, onSuccess, eventType = null, showHeader = true }) => {
  const formId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const isEditing = !!eventType;
  
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      name: eventType?.name || '',
      description: eventType?.description || ''
    }
  });

  const onSubmitForm = async (data) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Add isCustom flag to data
      const eventTypeData = {
        ...data,
        isCustom: true
      };
      
      if (isEditing) {
        await axiosInstance.put(`/eventTypes/${eventType._id}`, eventTypeData);
      } else {
        await axiosInstance.post('/eventTypes', eventTypeData);
      }
      
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      console.error('Error saving custom event type:', err);
      setError(err.response?.data?.message || 'An error occurred while saving the event type');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={showHeader ? styles.formContainer : styles.embedded}>
      {showHeader && (
        <div className={styles.formHeader}>
          <h2>{isEditing ? 'Edit Custom Event Type' : 'Create Custom Event Type'}</h2>
          <button 
            type="button" 
            className={styles.closeButton} 
            onClick={onClose}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
      )}
      
      <form id={formId} onSubmit={handleSubmit(onSubmitForm)}>
        {error && <div className={styles.errorMessage}>{error}</div>}
        <p className="required-legend">Fields marked * are required.</p>
        
        <div className={styles.formGroup}>
          <label htmlFor="name" className="required">Name</label>
          <input
            id="name"
            aria-required="true"
            {...register('name', { 
              required: 'Name is required',
              validate: (value) => value.trim() !== '' || 'Name is required',
              maxLength: {
                value: 50,
                message: 'Name cannot exceed 50 characters'
              }
            })}
          />
          {errors.name && <span className={styles.fieldError}>{errors.name.message}</span>}
        </div>
        
        <div className={styles.formGroup}>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            {...register('description', {
              maxLength: {
                value: 200,
                message: 'Description cannot exceed 200 characters'
              }
            })}
            rows="3"
          />
          {errors.description && <span className={styles.fieldError}>{errors.description.message}</span>}
        </div>
        
        <ModalActions className={styles.formActions}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </Button>
        </ModalActions>
      </form>
    </div>
  );
};

export default CustomEventTypeForm;
