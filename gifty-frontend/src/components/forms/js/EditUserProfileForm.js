import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import axiosInstance from '../../../axiosInstance';
import styles from '../css/EditUserProfileForm.module.css';
import { useAuth } from '../../../AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera } from '@fortawesome/free-solid-svg-icons';
import { resolveAssetUrl } from '../../../utils/apiBaseUrl';
import { toast } from 'react-toastify';

const EditUserProfileForm = ({ user, onSuccess, onCancel }) => {
  const { register, handleSubmit, setValue, watch } = useForm();
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const photoErrorRef = useRef(null);
  const [passwordError, setPasswordError] = useState(null);
  // The email is the login: changing it needs the current password
  const emailValue = watch('email');
  const emailChanged = Boolean(user) && typeof emailValue === 'string' && emailValue.trim() !== ''
    && emailValue.trim().toLowerCase() !== (user.email || '').toLowerCase();
  const { updateUser, fetchUserProfile } = useAuth();

  // The photo sits at the top of a long form: after Save the message would
  // be out of view
  useEffect(() => {
    const message = photoErrorRef.current;
    if (!photoError || !message) return;
    message.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    message.focus({ preventScroll: true });
  }, [photoError]);

  useEffect(() => {
    if (user) {
      setValue('username', user.username);
      setValue('email', user.email);
      setValue('firstName', user.firstName);
      setValue('lastName', user.lastName);
      setValue('dateOfBirth', user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : '');
      if (user.profilePicture) {
        setPreviewUrl(resolveAssetUrl(user.profilePicture));
      }
    }
  }, [user, setValue]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhotoError(null);
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const uploadProfilePicture = async (file) => {
    const formData = new FormData();
    formData.append('profilePicture', file);

    try {
      const response = await axiosInstance.post('/users/profile/picture', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      // Update the user context with the new profile picture
      updateUser({ profilePicture: response.data.profilePicture });
      return response.data.profilePicture;
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      throw error;
    }
  };

  // The server's reason, or the first invalid field's
  const reasonFor = (error, fallback) => {
    const body = error.response?.data;
    return body?.errors?.[0]?.message || body?.message || fallback;
  };

  const onSubmit = async (data) => {
    const { currentPassword, ...profile } = data;
    setPasswordError(null);
    // The profile first: a refused profile must not leave a new photo behind
    try {
      const response = await axiosInstance.put('/users/profile', emailChanged ? { ...profile, currentPassword } : profile);
      updateUser(response.data);
    } catch (error) {
      console.error('Error updating profile:', error);
      const passwordProblem = error.response?.data?.errors?.find((e) => e.field === 'currentPassword');
      if (passwordProblem) {
        setPasswordError(passwordProblem.message);
      } else {
        toast.error(reasonFor(error, 'Failed to update profile. Please try again.'));
      }
      return;
    }

    if (selectedImage) {
      try {
        await uploadProfilePicture(selectedImage);
      } catch (error) {
        setPhotoError(reasonFor(error, 'Your profile was saved, but the photo could not be uploaded. Please try again.'));
        // The refused file is not the photo: show the one that stays
        setSelectedImage(null);
        setPreviewUrl(user?.profilePicture ? resolveAssetUrl(user.profilePicture) : null);
        return;
      }
    }

    // Fetch the latest user data; the save already succeeded either way
    try {
      await fetchUserProfile();
    } catch (error) {
      console.error('Error refreshing the profile after saving:', error);
    }
    if (onSuccess) {
      onSuccess();
    }
  };

  const handleCancel = (e) => {
    e.preventDefault();
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
      <div className={styles.profilePictureSection}>
        {previewUrl && (
          <div className={styles.imagePreview}>
            <img src={previewUrl} alt="Profile preview" />
          </div>
        )}
        <label htmlFor="profile-picture-upload" className={styles.uploadButton}>
          <FontAwesomeIcon icon={faCamera} />
          <input
            id="profile-picture-upload"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            aria-describedby={photoError ? 'profile-picture-upload-error' : undefined}
            style={{ display: 'none' }}
          />
        </label>
      </div>
      {photoError && (
        <p id="profile-picture-upload-error" role="alert" tabIndex={-1} ref={photoErrorRef} className={styles.photoError}>{photoError}</p>
      )}
      <div className={styles.formGroup}>
        <label>Username:</label>
        <input type="text" {...register('username')} required />
      </div>
      <div className={styles.formGroup}>
        <label>Email:</label>
        <input type="email" {...register('email')} required />
      </div>
      {emailChanged && (
        <div className={styles.formGroup}>
          <label htmlFor="profile-current-password">Current password</label>
          <input
            id="profile-current-password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={passwordError ? 'true' : undefined}
            aria-describedby={passwordError ? 'profile-current-password-error' : 'profile-current-password-hint'}
            {...register('currentPassword')}
          />
          {passwordError ? (
            <p id="profile-current-password-error" role="alert" className={styles.fieldError}>{passwordError}</p>
          ) : (
            <p id="profile-current-password-hint" className={styles.hint}>Needed to change the email you sign in with.</p>
          )}
        </div>
      )}
      <div className={styles.formGroup}>
        <label>First Name:</label>
        <input type="text" {...register('firstName')} required />
      </div>
      <div className={styles.formGroup}>
        <label>Last Name:</label>
        <input type="text" {...register('lastName')} required />
      </div>
      <div className={styles.formGroup}>
        <label>Date of Birth:</label>
        <input type="date" {...register('dateOfBirth')} />
      </div>
      <div className={styles.buttonGroup}>
        <button type="button" onClick={handleCancel} className={styles.cancelButton}>Cancel</button>
        <button type="submit" className={styles.submitButton}>Save Changes</button>
      </div>
    </form>
  );
};

export default EditUserProfileForm;
