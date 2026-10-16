import React, { useState, useId } from 'react';
import { ModalActions } from '../../ui/Modal';
import Button from '../../ui/Button';
import { useForm, Controller } from 'react-hook-form';
import axiosInstance from '../../../axiosInstance';
import styles from '../css/EditRecipientForm.module.css';

const EditRecipientForm = ({ recipient, closeForm, onSubmit }) => {
  const formId = useId();
  const [submitError, setSubmitError] = useState('');
  const { control, handleSubmit } = useForm({
    defaultValues: {
      firstName: recipient.firstName,
      lastName: recipient.lastName,
      relation: recipient.relation,
      birthdate: recipient.birthdate ? new Date(recipient.birthdate).toISOString().split('T')[0] : '',
      tags: recipient.tags ? recipient.tags.map(tag => tag.name).join(', ') : ''
    }
  });

  const onSubmitForm = async (data) => {
    try {
      // Split tags and trim whitespace
      const tagNames = data.tags.split(',').map(tag => tag.trim()).filter(Boolean);
      
      // Prepare the data to be sent
      const updateData = {
        ...data,
        tags: tagNames // Send tags as an array of strings
      };

      setSubmitError('');
      const response = await axiosInstance.put(`/recipients/${recipient._id}`, updateData);
      onSubmit(response.data);
      closeForm();
    } catch (error) {
      console.error('Error updating recipient:', error);
      setSubmitError('Failed to update recipient. Please try again.');
    }
  };
 
  return (
    <div className={styles['edit-recipient-form']}>
      {submitError && <p className={styles['error-message']} role="alert">{submitError}</p>}
      <form id={formId} onSubmit={handleSubmit(onSubmitForm)}>
        <Controller
          name="firstName"
          control={control}
          rules={{ required: 'First name is required' }}
          render={({ field }) => (
            <label>
              First Name:
              <input {...field} type="text" required className={styles['form-input']} />
            </label>
          )}
        />
        <Controller
          name="lastName"
          control={control}
          rules={{ required: 'Last name is required' }}
          render={({ field }) => (
            <label>
              Last Name:
              <input {...field} type="text" required className={styles['form-input']} />
            </label>
          )}
        />
        <Controller
          name="relation"
          control={control}
          rules={{ required: 'Relation is required' }}
          render={({ field }) => (
            <label>
              Relation:
              <input {...field} type="text" required className={styles['form-input']} />
            </label>
          )}
        />
        <Controller
          name="birthdate"
          control={control}
          render={({ field }) => (
            <label>
              Birthdate:
              <input {...field} type="date" required className={styles['form-input']} />
            </label>
          )}
        />
        <Controller
          name="tags"
          control={control}
          render={({ field }) => (
            <label className={styles['full-width-field']}>
              Tags:
              <input {...field} type="text" placeholder="Enter tags separated by commas" className={styles['form-input']} />
              <small className={styles['form-text']}>
                Example: skiing, pets, traveling
              </small>
            </label>
          )}
        />
        <ModalActions className={styles['form-actions']}>
          <Button variant="secondary" onClick={closeForm}>Cancel</Button>
          <Button type="submit" form={formId}>Save</Button>
        </ModalActions>
      </form>
    </div>
  );
};

export default EditRecipientForm;
