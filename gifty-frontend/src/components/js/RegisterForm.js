import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import axiosInstance from '../../axiosInstance';
import styles from '../../pages/css/Register.module.css';

// Labelled fields with autocomplete hints so password managers can fill them
const FIELDS = [
  { name: 'username', label: 'Username', autoComplete: 'username' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
  { name: 'confirmPassword', label: 'Confirm Password', type: 'password', autoComplete: 'new-password' },
  { name: 'firstName', label: 'First Name', autoComplete: 'given-name' },
  { name: 'lastName', label: 'Last Name', autoComplete: 'family-name' },
  { name: 'dateOfBirth', label: 'Date of Birth', type: 'date', autoComplete: 'bday' },
];

// The account form shared by open sign-up, invite links and the setup
// wizard. setupRequired: the first account (the instance owner) needs the
// one-time setup code from the server log or the data folder. inviteToken:
// sent with the registration; lockedEmail: the address an invite is tied to
export default function RegisterForm({
  setupRequired: setupRequiredProp = false, inviteToken = null, lockedEmail = null, onRegistered, submitLabel = 'Create Account'
}) {
  const { handleSubmit, register, setFocus } = useForm({ defaultValues: lockedEmail ? { email: lockedEmail } : {} });
  const [error, setError] = useState('');
  const [setupRequired, setSetupRequired] = useState(setupRequiredProp);
  const [setupCodeError, setSetupCodeError] = useState('');

  useEffect(() => setSetupRequired(setupRequiredProp), [setupRequiredProp]);

  // The field may only just have appeared (see below): focus it once rendered
  useEffect(() => {
    if (setupCodeError) setFocus('setupCode');
  }, [setupCodeError, setFocus]);

  const onSubmit = async (formData) => {
    const { setupCode, ...data } = formData;
    setError('');
    setSetupCodeError('');
    if (data.password !== data.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      const body = { ...data, ...(setupRequired ? { setupCode } : {}), ...(inviteToken ? { inviteToken } : {}) };
      const { data: created } = await axiosInstance.post('/users/register', body);
      onRegistered?.(created);
    } catch (error) {
      console.error('Registration error:', error);
      const codeProblem = error.response?.data?.errors?.find((e) => e.field === 'setupCode');
      if (codeProblem) {
        // The instance info may not have loaded: the server still asks for
        // the code, so show the field it belongs to
        setSetupRequired(true);
        setSetupCodeError(codeProblem.message);
      } else if (error.response?.data?.message) {
        setError(error.response.data.message);
      } else {
        setError('An error occurred during registration. Please try again.');
      }
    }
  };

  return (
    <div className={styles['register-form']}>
      <h1>Create Account</h1>
      {error && <p className={styles['error-message']} role="alert">{error}</p>}
      <form onSubmit={handleSubmit(onSubmit)} className={styles['form-box']}>
        {FIELDS.map(({ name, label, type = 'text', autoComplete }) => {
          const locked = name === 'email' && Boolean(lockedEmail);
          return (
            <div key={name} className={styles.field}>
              <label htmlFor={`register-${name}`} className={styles.label}>{label}</label>
              <input
                id={`register-${name}`}
                type={type}
                autoComplete={autoComplete}
                className={styles.input}
                required
                {...(locked ? { readOnly: true, 'aria-describedby': 'register-email-locked' } : { defaultValue: '' })}
                {...register(name)}
              />
              {locked && <p id="register-email-locked" className={styles.hint}>This invite is for this address.</p>}
            </div>
          );
        })}
        {setupRequired && (
          <div className={styles.field}>
            <label htmlFor="register-setupCode" className={styles.label}>Setup code</label>
            <input
              id="register-setupCode"
              type="text"
              autoComplete="off"
              spellCheck={false}
              className={styles.input}
              required
              defaultValue=""
              aria-invalid={setupCodeError ? 'true' : undefined}
              aria-describedby={setupCodeError ? 'register-setupCode-error' : 'register-setupCode-hint'}
              {...register('setupCode')}
            />
            {setupCodeError ? (
              <p id="register-setupCode-error" role="alert" className={styles['field-error']}>{setupCodeError}</p>
            ) : (
              <p id="register-setupCode-hint" className={styles.hint}>
                This is the first account on this server, so it becomes the owner. Find the setup code in the server log or in setup-code.txt in the data folder.
              </p>
            )}
          </div>
        )}
        <Button type="submit" className={styles['submit-button']}>
          {submitLabel}
        </Button>
        <Link to="/login" className={styles['login-link']}>
          Already have an account? Sign in
        </Link>
      </form>
    </div>
  );
}
