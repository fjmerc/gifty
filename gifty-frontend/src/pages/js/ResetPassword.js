import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import axiosInstance from '../../axiosInstance';
import styles from '../css/Register.module.css';

const FALLBACK = "This reset link isn't valid. Ask an admin for a new one.";

// /reset/:token: set a new password with a one-time link from an admin
export default function ResetPassword() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => axiosInstance.get(`/password-reset/${encodeURIComponent(token)}`))
      .then(() => { if (alive) setState({ ready: true }); })
      .catch((e) => { if (alive) setState({ problem: e?.response?.data?.message || FALLBACK }); });
    return () => { alive = false; };
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    try {
      const { data } = await axiosInstance.post(`/password-reset/${encodeURIComponent(token)}`, { password });
      setState({ done: data?.message || 'Your password was changed. Sign in with the new one.' });
    } catch (e) {
      const status = e?.response?.status;
      // A refused password comes back as field errors: show the rule that failed
      const message = e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message || 'Something went wrong. Try again.';
      // A link that stopped working (used, expired, deactivated) ends the form
      if (status === 404 || status === 410 || status === 403) setState({ problem: message });
      else setError(message);
    }
  };

  const shell = (children) => (
    <div className={styles['register-container']}><div className={styles['register-form']}><h1>New password</h1>{children}</div></div>
  );
  if (state.loading) return shell(<p role="status">Loading…</p>);
  if (state.problem) return shell(<p role="alert">{state.problem}</p>);
  if (state.done) return shell(<><p role="status">{state.done}</p><Link to="/login" className={styles['login-link']}>Sign in</Link></>);
  return shell(
    <form onSubmit={submit} className={styles['form-box']}>
      {error && <p className={styles['error-message']} role="alert">{error}</p>}
      <div className={styles.field}>
        <label htmlFor="reset-password" className={styles.label}>New password</label>
        <input id="reset-password" type="password" autoComplete="new-password" className={styles.input} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label htmlFor="reset-confirm" className={styles.label}>Confirm new password</label>
        <input id="reset-confirm" type="password" autoComplete="new-password" className={styles.input} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <p className={styles.hint}>At least 8 characters, with an uppercase letter, a lowercase letter, a number and one of @$!%*?&.</p>
      <Button type="submit" className={styles['submit-button']}>Set password</Button>
    </form>
  );
}
