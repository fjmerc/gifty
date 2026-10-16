import React, { useState, useId, useRef } from 'react';
import { ModalActions } from '../../ui/Modal';
import Button from '../../ui/Button';
import styles from '../css/AddRecipientForm.module.css';

const AddRecipientForm = ({ onSubmit, onCancel, showTitle = true }) => {
  const formId = useId();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    relation: '',
    birthdate: ''
  });
  const [errors, setErrors] = useState({});
  const fieldRefs = useRef({});
  const fieldRef = (field) => (element) => { fieldRefs.current[field] = element; };
  const errorId = (field) => `${formId}-${field}-error`;
  const invalidProps = (field) => (errors[field]
    ? { 'aria-invalid': true, 'aria-describedby': errorId(field) }
    : {});

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [id]: value
    }));
    // Clear error when user starts typing
    if (errors[id]) {
      setErrors(prev => ({
        ...prev,
        [id]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    if (!formData.relation.trim()) {
      newErrors.relation = 'Relation is required';
    }
    if (!formData.birthdate) {
      newErrors.birthdate = 'Birthdate is required';
    }
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validateForm();

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Keys follow the form's order
      fieldRefs.current[Object.keys(newErrors)[0]]?.focus();
      return;
    }

    try {
      await onSubmit(formData);
      // Clear form after successful submission
      setFormData({
        firstName: '',
        lastName: '',
        relation: '',
        birthdate: ''
      });
    } catch (error) {
      console.error('Error adding recipient:', error);
      setErrors({
        submit: 'Failed to add recipient. Please try again.'
      });
    }
  };

  return (
    <div className={styles['event-form-container']}>
      <form id={formId} className={styles['event-form']} onSubmit={handleSubmit}>
        {showTitle && <h2>Add Recipient</h2>}
        <p className="required-legend">Fields marked * are required.</p>
        
        <div className={styles['form-group']}>
          <label htmlFor="firstName" className="required">First Name</label>
          <input
            type="text"
            id="firstName"
            aria-required="true"
            ref={fieldRef('firstName')}
            {...invalidProps('firstName')}
            value={formData.firstName}
            onChange={handleChange}
          />
          {errors.firstName && <span id={errorId('firstName')} className={styles.error}>{errors.firstName}</span>}
        </div>

        <div className={styles['form-group']}>
          <label htmlFor="lastName" className="required">Last Name</label>
          <input
            type="text"
            id="lastName"
            aria-required="true"
            ref={fieldRef('lastName')}
            {...invalidProps('lastName')}
            value={formData.lastName}
            onChange={handleChange}
          />
          {errors.lastName && <span id={errorId('lastName')} className={styles.error}>{errors.lastName}</span>}
        </div>

        <div className={styles['form-group']}>
          <label htmlFor="relation" className="required">Relation</label>
          <select
            id="relation"
            aria-required="true"
            ref={fieldRef('relation')}
            {...invalidProps('relation')}
            value={formData.relation}
            onChange={handleChange}
          >
            <option value="">Select a relation</option>
            <option value="Family">Family</option>
            <option value="Friend">Friend</option>
            <option value="Colleague">Colleague</option>
            <option value="Other">Other</option>
          </select>
          {errors.relation && <span id={errorId('relation')} className={styles.error}>{errors.relation}</span>}
        </div>

        <div className={styles['form-group']}>
          <label htmlFor="birthdate" className="required">Birthdate</label>
          <input
            type="date"
            id="birthdate"
            aria-required="true"
            ref={fieldRef('birthdate')}
            {...invalidProps('birthdate')}
            value={formData.birthdate}
            onChange={handleChange}
          />
          {errors.birthdate && <span id={errorId('birthdate')} className={styles.error}>{errors.birthdate}</span>}
        </div>

        {errors.submit && <div className={styles.error}>{errors.submit}</div>}

        <ModalActions className={styles['form-actions']}>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" form={formId}>Add Recipient</Button>
        </ModalActions>
      </form>
    </div>
  );
};

export default AddRecipientForm;
