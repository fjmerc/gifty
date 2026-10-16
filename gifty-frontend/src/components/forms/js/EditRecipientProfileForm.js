import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../../axiosInstance';
import styles from '../css/EditRecipientProfileForm.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';

const EditRecipientProfileForm = ({ recipient }) => {
  const navigate = useNavigate();
  const [wishListItems, setWishListItems] = useState(recipient?.wishList || []);
  const [budget, setBudget] = useState(null);
  const personalityTraitOptions = ['introverted', 'extroverted', 'analytical', 'creative', 'adventurous', 'cautious', 'organized', 'spontaneous'];

  const { control, handleSubmit, formState: { errors, dirtyFields }, setError, watch, reset, trigger } = useForm({
    defaultValues: {
      firstName: recipient?.firstName || '',
      lastName: recipient?.lastName || '',
      relation: recipient?.relation || '',
      relationship: recipient?.relationship || '',
      birthdate: recipient?.birthdate ? new Date(recipient.birthdate).toISOString().split('T')[0] : '',
      tags: recipient?.tags ? recipient.tags.map(tag => tag.name).join(', ') : '',
      minimumPriceBudget: budget?.minimumAmount || recipient?.minimumPriceBudget || '',
      maximumPriceBudget: budget?.maximumAmount || recipient?.maximumPriceBudget || '',
      giftStatus: recipient?.giftStatus || 'inactive',
      visibility: recipient?.visibility || true,
      address: {
        street: recipient?.address?.street || '',
        city: recipient?.address?.city || '',
        state: recipient?.address?.state || '',
        country: recipient?.address?.country || '',
        zipCode: recipient?.address?.zipCode || '',
      },
      interests: recipient?.interests ? recipient.interests.join(', ') : '',
      hobbies: recipient?.hobbies ? recipient.hobbies.join(', ') : '',
      favoriteColors: recipient?.favoriteColors ? recipient.favoriteColors.join(', ') : '',
      favoriteBooks: recipient?.favoriteBooks ? recipient.favoriteBooks.join(', ') : '',
      favoriteMovies: recipient?.favoriteMovies ? recipient.favoriteMovies.join(', ') : '',
      favoriteMusic: recipient?.favoriteMusic ? recipient.favoriteMusic.join(', ') : '',
      personalityTraits: recipient?.personalityTraits || [],
      occupation: recipient?.occupation || '',
      workSchedule: recipient?.workSchedule || '',
      relationshipLength: recipient?.relationshipLength || '',
      relationshipCloseness: recipient?.relationshipCloseness || 'neutral',
      giftPreferences: recipient?.giftPreferences || 'practical',
      dietaryRestrictions: recipient?.dietaryRestrictions ? recipient.dietaryRestrictions.join(', ') : '',
      clothingSizes: {
        shirt: recipient?.clothingSizes?.shirt || '',
        pants: recipient?.clothingSizes?.pants || '',
        shoe: recipient?.clothingSizes?.shoe || '',
      },
    }
  });

  useEffect(() => {
    const fetchBudget = async () => {
      try {
        const response = await axiosInstance.get(`/budgets/recipient/${recipient._id}/${new Date().getFullYear()}`);
        setBudget(response.data);
        // An { exists: false } view has no amounts to load into the form
        if (response.data && response.data.exists !== false && response.data.allocationType !== 'percentage') {
          reset(formValues => ({
            ...formValues,
            minimumPriceBudget: response.data.minimumAmount,
            maximumPriceBudget: response.data.maximumAmount
          }));
        }
      } catch (error) {
        console.error('Error fetching budget:', error);
      }
    };
    
    if (recipient?._id) {
      fetchBudget();
    }
  }, [recipient?._id, reset]);

  const giftStatus = watch('giftStatus');
  const minimumBudget = watch('minimumPriceBudget');
  const maximumBudget = watch('maximumPriceBudget');
  // A percentage budget has no min/max of its own (the server derives its limit),
  // so the price-range rules do not apply to it.
  const isPercentageBudget = budget?.exists !== false && budget?.allocationType === 'percentage';
  // Budgets are never created implicitly: without an existing budget the
  // price-budget fields are optional and only values the user enters count.
  const hasExistingBudget = !!budget && budget.exists !== false && !!budget._id;
  const budgetFieldsRequired = giftStatus === 'active' && hasExistingBudget && !isPercentageBudget;
  const isBlank = (value) => value === '' || value === null || value === undefined;

  // Validation rules
  const validationRules = {
    firstName: {
      required: 'First name is required',
      minLength: { value: 2, message: 'First name must be at least 2 characters' },
      maxLength: { value: 50, message: 'First name must be no more than 50 characters' },
      pattern: { value: /^[a-zA-Z\s'-]+$/, message: 'First name can only contain letters, spaces, hyphens, and apostrophes' }
    },
    lastName: {
      required: 'Last name is required',
      minLength: { value: 2, message: 'Last name must be at least 2 characters' },
      maxLength: { value: 50, message: 'Last name must be no more than 50 characters' },
      pattern: { value: /^[a-zA-Z\s'-]+$/, message: 'Last name can only contain letters, spaces, hyphens, and apostrophes' }
    },
    relation: {
      required: 'Relation is required',
      minLength: { value: 2, message: 'Relation must be at least 2 characters' },
      maxLength: { value: 100, message: 'Relation must be no more than 100 characters' }
    },
    relationship: {
      required: 'Relationship type is required'
    },
    birthdate: {
      required: 'Birthdate is required',
      validate: {
        notFuture: (value) => {
          const today = new Date();
          const birthDate = new Date(value);
          return birthDate <= today || 'Birthdate cannot be in the future';
        },
        notTooOld: (value) => {
          const birthDate = new Date(value);
          const today = new Date();
          const age = today.getFullYear() - birthDate.getFullYear();
          return age <= 150 || 'Please enter a valid birthdate';
        }
      }
    },
    minimumPriceBudget: {
      required: budgetFieldsRequired ? 'Minimum price budget is required when gift status is active' : false,
      min: { value: 0, message: 'Minimum budget must be a positive number' },
      max: { value: 10000, message: 'Minimum budget must be less than $10,000' },
      validate: {
        isNumber: (value) => {
          if (giftStatus === 'active' && value !== '' && isNaN(Number(value))) {
            return 'Please enter a valid number';
          }
          return true;
        },
        lessThanMax: (value) => {
          if (giftStatus === 'active' && !isBlank(value) && !isBlank(maximumBudget) && Number(value) >= Number(maximumBudget)) {
            return 'Minimum budget must be less than maximum budget';
          }
          return true;
        }
      }
    },
    maximumPriceBudget: {
      required: budgetFieldsRequired ? 'Maximum price budget is required when gift status is active' : false,
      min: { value: 1, message: 'Maximum budget must be greater than 0' },
      max: { value: 10000, message: 'Maximum budget must be less than or equal to $10,000' },
      validate: {
        isNumber: (value) => {
          if (giftStatus === 'active' && value !== '' && isNaN(Number(value))) {
            return 'Please enter a valid number';
          }
          return true;
        },
        greaterThanMin: (value) => {
          if (giftStatus === 'active' && !isBlank(value) && !isBlank(minimumBudget) && Number(value) <= Number(minimumBudget)) {
            return 'Maximum budget must be greater than minimum budget';
          }
          return true;
        }
      }
    },
    relationshipLength: {
      validate: {
        isValidNumber: (value) => {
          if (value !== '' && (isNaN(Number(value)) || Number(value) < 0)) {
            return 'Relationship length must be a positive number';
          }
          return true;
        },
        reasonableRange: (value) => {
          if (value !== '' && Number(value) > 100) {
            return 'Please enter a reasonable relationship length';
          }
          return true;
        }
      }
    }
  };

  // Helper function to get input class with error state
  const getInputClass = (fieldName) => {
    const hasError = errors[fieldName] || (fieldName.includes('.') && errors[fieldName.split('.')[0]]?.[fieldName.split('.')[1]]);
    return hasError ? `${styles.input} ${styles.error}` : styles.input;
  };

  const onSubmit = async (data) => {
    try {
      const arrayFields = ['tags', 'interests', 'hobbies', 'favoriteColors', 'favoriteBooks', 'favoriteMovies', 'favoriteMusic', 'dietaryRestrictions'];
      arrayFields.forEach(field => {
        if (typeof data[field] === 'string') {
          data[field] = data[field].split(',').map(item => item.trim()).filter(Boolean);
        } else if (!Array.isArray(data[field])) {
          data[field] = [];
        }
      });
      
      data.wishList = wishListItems;

      // Update recipient data
      await axiosInstance.put(`/recipients/${recipient?._id}`, data);

      // Budgets change only for an active recipient: an existing budget is
      // updated; a new one is created only from values the user entered here.
      const enteredBudget = !!(dirtyFields.minimumPriceBudget || dirtyFields.maximumPriceBudget);
      if (data.giftStatus === 'active' && (hasExistingBudget || enteredBudget)) {
        const minBudget = isBlank(data.minimumPriceBudget) ? 0 : Number(data.minimumPriceBudget);
        const maxBudget = Number(data.maximumPriceBudget);

        if (!hasExistingBudget && isBlank(data.maximumPriceBudget)) {
          setError('maximumPriceBudget', {
            type: 'manual',
            message: 'Enter a maximum price budget to set a budget, or clear both fields'
          });
          return;
        }

        if (!isPercentageBudget && minBudget >= maxBudget) {
          setError('minimumPriceBudget', {
            type: 'manual',
            message: 'Minimum budget must be less than maximum budget'
          });
          setError('maximumPriceBudget', {
            type: 'manual',
            message: 'Maximum budget must be greater than minimum budget'
          });
          return;
        }

        const budgetData = {
          minimumAmount: minBudget,
          maximumAmount: maxBudget,
          isActive: true
        };

        // Configuration only: spending is derived and the currency is the overall budget's
        if (hasExistingBudget) {
          const isPercentage = budget.allocationType === 'percentage';
          await axiosInstance.put(`/budgets/recipient/${recipient._id}/${new Date().getFullYear()}`, {
            allocationType: budget.allocationType || 'fixed',
            isLimited: budget.isLimited !== false,
            // A percentage budget's limit is derived from the overall budget: send its percentage, not min/max
            ...(isPercentage
              ? { percentageAllocation: budget.percentageAllocation, isActive: true }
              : budgetData)
          });
        } else {
          // The server refuses this without an overall budget; we never create one for the user
          await axiosInstance.post('/budgets/recipient', {
            recipientId: recipient._id,
            year: new Date().getFullYear(),
            allocationType: 'fixed',
            ...budgetData,
            isLimited: true,
            frequency: 'yearly',
            category: 'gifts'
          });
        }
      }

      navigate(`/recipients/${recipient?._id}`);
    } catch (error) {
      console.error('Error updating recipient:', error);
      
      // Handle specific budget-related errors
      if (error.response?.data?.message === "Overall budget must be set first") {
        setError('submit', {
          type: 'manual',
          message: `An overall budget is required before setting recipient budgets. Set your overall budget for ${new Date().getFullYear()} in the Budgets section first.`
        });
      } else if (error.response?.data?.message?.includes('budget')) {
        setError('submit', {
          type: 'manual',
          message: `Budget Error: ${error.response.data.message}. Please check your budget settings and try again.`
        });
      } else if (error.response && error.response.data && error.response.data.errors) {
        // Parse error response for specific field errors
        const serverErrors = error.response.data.errors;
        Object.keys(serverErrors).forEach(field => {
          setError(field, {
            type: 'server',
            message: serverErrors[field]
          });
        });
      } else {
        setError('submit', {
          type: 'manual',
          message: error.response?.data?.message || 'An error occurred while updating the recipient. Please try again.'
        });
      }
    }
  };

  const addWishListItem = () => {
    setWishListItems([...wishListItems, { item: '', priority: 'medium' }]);
  };

  const updateWishListItem = (index, field, value) => {
    const updatedItems = [...wishListItems];
    updatedItems[index][field] = value;
    setWishListItems(updatedItems);
  };

  const removeWishListItem = (index) => {
    setWishListItems(wishListItems.filter((_, i) => i !== index));
  };

  if (!recipient) {
    return <div>Loading...</div>;
  }

  return (
    <div className={styles['edit-recipient-page']}>
      <form onSubmit={handleSubmit(onSubmit)} className={styles['edit-recipient-form']}>
        <h2>Recipient Profile</h2>

        <section>
          <h3>Basic Information</h3>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>First Name</label>
              <Controller 
                name="firstName" 
                control={control} 
                rules={validationRules.firstName} 
                render={({ field }) => (
                  <input 
                    {...field} 
                    className={getInputClass('firstName')}
                    onBlur={() => trigger('firstName')}
                  />
                )} 
              />
              {errors.firstName && <span className={styles.error}>{errors.firstName.message}</span>}
            </div>
            <div className={styles['form-group']}>
              <label>Last Name</label>
              <Controller 
                name="lastName" 
                control={control} 
                rules={validationRules.lastName} 
                render={({ field }) => (
                  <input 
                    {...field} 
                    className={getInputClass('lastName')}
                    onBlur={() => trigger('lastName')}
                  />
                )} 
              />
              {errors.lastName && <span className={styles.error}>{errors.lastName.message}</span>}
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>Relation</label>
              <Controller 
                name="relation" 
                control={control} 
                rules={validationRules.relation} 
                render={({ field }) => (
                  <input 
                    {...field} 
                    className={getInputClass('relation')}
                    onBlur={() => trigger('relation')}
                  />
                )} 
              />
              {errors.relation && <span className={styles.error}>{errors.relation.message}</span>}
            </div>
            <div className={styles['form-group']}>
              <label>Relationship Type</label>
              <Controller 
                name="relationship" 
                control={control} 
                rules={validationRules.relationship}
                render={({ field }) => (
                  <select 
                    {...field} 
                    className={getInputClass('relationship')}
                    onBlur={() => trigger('relationship')}
                  >
                    <option value="">Select a relationship type</option>
                    <option value="family">Family</option>
                    <option value="romantic">Romantic</option>
                    <option value="friendship">Friendship</option>
                    <option value="professional">Professional</option>
                    <option value="community">Community</option>
                    <option value="online">Online</option>
                    <option value="situational">Situational</option>
                    <option value="service">Service</option>
                    <option value="acquaintance">Acquaintance</option>
                    <option value="rival">Rival</option>
                    <option value="platonic">Platonic</option>
                  </select>
                )} 
              />
              {errors.relationship && <span className={styles.error}>{errors.relationship.message}</span>}
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>Birthdate</label>
              <Controller 
                name="birthdate" 
                control={control} 
                rules={validationRules.birthdate} 
                render={({ field }) => (
                  <input 
                    type="date" 
                    {...field} 
                    className={getInputClass('birthdate')}
                    onBlur={() => trigger('birthdate')}
                  />
                )} 
              />
              {errors.birthdate && <span className={styles.error}>{errors.birthdate.message}</span>}
            </div>
          </div>
        </section>

        <section>
          <h3>Gift Information</h3>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>Gift Status</label>
              <Controller 
                name="giftStatus" 
                control={control} 
                render={({ field }) => (
                  <select {...field} className={styles.input}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="paused">Paused</option>
                    <option value="seasonal">Seasonal</option>
                  </select>
                )} 
              />
            </div>
            <div className={styles['form-group']}>
              <label>Visibility</label>
              <Controller 
                name="visibility" 
                control={control} 
                render={({ field }) => (
                  <select {...field} className={styles.input}>
                    <option value={true}>Visible</option>
                    <option value={false}>Hidden</option>
                  </select>
                )} 
              />
            </div>
          </div>
          {giftStatus === 'active' && (
            <div className={styles.row}>
              <div className={styles['form-group']}>
                <label>Minimum Price Budget</label>
                <Controller 
                  name="minimumPriceBudget" 
                  control={control} 
                  rules={isPercentageBudget ? {} : validationRules.minimumPriceBudget} 
                  render={({ field }) => (
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      max="10000" 
                      {...field} 
                      className={getInputClass('minimumPriceBudget')}
                      onBlur={() => {
                        trigger('minimumPriceBudget');
                        trigger('maximumPriceBudget');
                      }}
                    />
                  )} 
                />
                {errors.minimumPriceBudget && <span className={styles.error}>{errors.minimumPriceBudget.message}</span>}
              </div>
              <div className={styles['form-group']}>
                <label>Maximum Price Budget</label>
                <Controller 
                  name="maximumPriceBudget" 
                  control={control} 
                  rules={isPercentageBudget ? {} : validationRules.maximumPriceBudget} 
                  render={({ field }) => (
                    <input 
                      type="number" 
                      step="0.01" 
                      min="1" 
                      max="10000" 
                      {...field} 
                      className={getInputClass('maximumPriceBudget')}
                      onBlur={() => {
                        trigger('maximumPriceBudget');
                        trigger('minimumPriceBudget');
                      }}
                    />
                  )} 
                />
                {errors.maximumPriceBudget && <span className={styles.error}>{errors.maximumPriceBudget.message}</span>}
              </div>
            </div>
          )}
        </section>

        <section>
          <h3>Contact Details</h3>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>Street</label>
              <Controller name="address.street" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
            <div className={styles['form-group']}>
              <label>City</label>
              <Controller name="address.city" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>State</label>
              <Controller name="address.state" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
            <div className={styles['form-group']}>
              <label>Country</label>
              <Controller name="address.country" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>Zip Code</label>
              <Controller name="address.zipCode" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
          </div>
        </section>

        <section>
          <h3>Preferences and Lifestyle</h3>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>Interests - Likes or is curious about (comma-separated)</label>
              <Controller name="interests" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
            <div className={styles['form-group']}>
              <label>Hobbies (comma-separated)</label>
              <Controller name="hobbies" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>Favorite Colors (comma-separated)</label>
              <Controller name="favoriteColors" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
            <div className={styles['form-group']}>
              <label>Favorite Books (comma-separated)</label>
              <Controller name="favoriteBooks" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>Favorite Movies (comma-separated)</label>
              <Controller name="favoriteMovies" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
            <div className={styles['form-group']}>
              <label>Favorite Music (comma-separated)</label>
              <Controller name="favoriteMusic" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
          </div>
          <div className={styles.row}>
          <div className={styles['form-group']}>
            <label>Personality Traits</label>
            <div className={styles['personality-traits']}>
              {personalityTraitOptions.map((trait) => (
                <div key={trait} className={styles['personality-trait']}>
                  <Controller
                    name="personalityTraits"
                    control={control}
                    render={({ field }) => (
                      <input
                        type="checkbox"
                        id={`trait-${trait}`}
                        value={trait}
                        checked={field.value.includes(trait)}
                        onChange={(e) => {
                          const updatedTraits = e.target.checked
                            ? [...field.value, trait]
                            : field.value.filter((t) => t !== trait);
                          field.onChange(updatedTraits);
                        }}
                      />
                    )}
                  />
                  <label htmlFor={`trait-${trait}`}>{trait.charAt(0).toUpperCase() + trait.slice(1)}</label>
                </div>
              ))}
            </div>
          </div>
          </div>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>Occupation</label>
              <Controller name="occupation" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
            <div className={styles['form-group']}>
              <label>Work Schedule</label>
              <Controller name="workSchedule" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>Relationship Length (years)</label>
              <Controller 
                name="relationshipLength" 
                control={control} 
                rules={validationRules.relationshipLength}
                render={({ field }) => (
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0" 
                    max="100" 
                    {...field} 
                    className={getInputClass('relationshipLength')}
                    onBlur={() => trigger('relationshipLength')}
                  />
                )} 
              />
              {errors.relationshipLength && <span className={styles.error}>{errors.relationshipLength.message}</span>}
            </div>
            <div className={styles['form-group']}>
              <label>Relationship Closeness</label>
				<Controller 
                name="relationshipCloseness" 
                control={control} 
                render={({ field }) => (
                  <select {...field} className={styles.input}>
                    <option value="very close">Very Close</option>
                    <option value="close">Close</option>
                    <option value="neutral">Neutral</option>
                    <option value="distant">Distant</option>
                    <option value="very distant">Very Distant</option>
                  </select>
                )} 
              />
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>Gift Preferences</label>
              <Controller 
                name="giftPreferences" 
                control={control} 
                render={({ field }) => (
                  <select {...field} className={styles.input}>
                    <option value="practical">Practical</option>
                    <option value="sentimental">Sentimental</option>
                    <option value="experiential">Experiential</option>
                    <option value="luxury">Luxury</option>
                    <option value="handmade">Handmade</option>
                  </select>
                )} 
              />
            </div>
            <div className={styles['form-group']}>
              <label>Dietary Restrictions (comma-separated)</label>
              <Controller name="dietaryRestrictions" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>Shirt Size</label>
              <Controller name="clothingSizes.shirt" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
            <div className={styles['form-group']}>
              <label>Pants Size</label>
              <Controller name="clothingSizes.pants" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles['form-group']}>
              <label>Shoe Size</label>
              <Controller name="clothingSizes.shoe" control={control} render={({ field }) => <input {...field} className={styles.input} />} />
            </div>
          </div>
        </section>

        <section>
          <h3>Wish List</h3>
          {wishListItems.map((item, index) => (
            <div key={index} className={styles['wish-list-item']}>
              <input
                type="text"
                value={item.item}
                onChange={(e) => updateWishListItem(index, 'item', e.target.value)}
                placeholder="Wish list item"
                className={styles.input}
              />
              <select
                value={item.priority}
                onChange={(e) => updateWishListItem(index, 'priority', e.target.value)}
                className={styles.input}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <button
                type="button"
                onClick={() => removeWishListItem(index)}
                className={styles['remove-button']}
                aria-label={`Remove wish list item ${index + 1}`}
              >
                <FontAwesomeIcon icon={faMinus} aria-hidden="true" />
              </button>
            </div>
          ))}
          <div className={styles['wish-list-actions']}>
            <button type="button" onClick={addWishListItem} className={styles['add-button']} aria-label="Add wish list item">
              <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
            </button>
          </div>
        </section>

        {errors.submit && <div className={styles.errorMessage}>{errors.submit.message}</div>}

        <div className={styles['form-actions']}>
          <button type="button" onClick={() => navigate(`/recipients/${recipient._id}`)} className={styles['cancel-button']}>Cancel</button>
          <button type="submit" className={styles['submit-button']}>Save Changes</button>
        </div>
      </form>
    </div>
  );
};

export default EditRecipientProfileForm;
