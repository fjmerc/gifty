import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import RegisterForm from '../../components/js/RegisterForm';
import InstanceSettingsForm from '../../components/js/admin/InstanceSettingsForm';
import InstanceStatus from '../../components/js/admin/InstanceStatus';
import axiosInstance from '../../axiosInstance';
import { useAuth } from '../../AuthContext';
import { resetInstanceInfoCache } from '../../utils/instanceInfo';
import styles from '../css/Setup.module.css';

const messageOf = (error) => error?.response?.data?.message || 'Something went wrong. Try again.';

// First run (1b): 1. the owner account (setup code), 2. household defaults,
// 3. what the server detected. Steps 2 and 3 can be skipped; finishing
// either way marks setup complete. An unfinished setup resumes at step 2.
export default function Setup() {
  const { user, isLoading, fetchUserProfile } = useAuth() || {};
  const navigate = useNavigate();
  const [instance, setInstance] = useState(null);
  // Set only by transitions (1→2, 2→3); the starting step is derived below,
  // in the same render, so nothing redirects before it is known
  const [step, setStep] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => axiosInstance.get('/instance'))
      .then((res) => { if (alive) setInstance(res.data); })
      .catch(() => { if (alive) setInstance({}); });
    return () => { alive = false; };
  }, []);

  const current = step ?? (instance?.setupRequired ? 1 : user?.isOwner && instance && !instance.setupComplete ? 2 : null);
  const needsSettings = current === 2 || current === 3;

  useEffect(() => {
    if (!needsSettings || settings) return;
    axiosInstance.get('/admin/settings').then((res) => setSettings(res.data)).catch((e) => setError(messageOf(e)));
  }, [needsSettings, settings]);

  // Wait for /instance and for the sign-in check (a reload of /setup), as ProtectedRoute does
  if (!instance || (isLoading && !instance.setupRequired)) return <main className={styles.page}><p role="status">Loading…</p></main>;
  if (!current) {
    if (!user) return <Navigate to="/login" replace />;
    return <Navigate to={user.isOwner ? '/admin' : '/userhome'} replace />;
  }

  const save = async (values) => {
    setSaving(true);
    setError('');
    try {
      await axiosInstance.patch('/admin/settings', values);
    } catch (e) {
      setSaving(false);
      setError(messageOf(e));
      return;
    }
    try {
      await axiosInstance.put('/users/preferences', { preferences: { currency: values.defaultCurrency, holidaySettings: { countryCode: values.defaultCountry } } });
      await fetchUserProfile?.();
      setStep(3);
    } catch (e) {
      setError(`Saved for new accounts, but your own account's country and currency weren't changed: ${messageOf(e)}. Try again, or change them later in Settings.`);
    } finally {
      setSaving(false);
    }
  };

  const finish = async (to) => {
    try {
      await axiosInstance.post('/admin/setup-complete');
      resetInstanceInfoCache();
      navigate(to);
    } catch (e) {
      setError(messageOf(e));
    }
  };

  return (
    <main className={styles.page}>
      <p className={styles.progress}>Step {current} of 3</p>
      {current === 1 && (
        <>
          <h1>Set up Gifty</h1>
          <p>Create the first account. It owns this Gifty: it can invite people, make admins and restore backups.</p>
          <RegisterForm setupRequired submitLabel="Create owner account" onRegistered={async () => { await fetchUserProfile?.(); setStep(2); }} />
        </>
      )}
      {current === 2 && (
        <>
          <h1>Household defaults</h1>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {settings && (
            <InstanceSettingsForm settings={settings} onSave={save} saving={saving} submitLabel="Save and continue"
              extraActions={<button type="button" className={styles.secondaryButton} onClick={() => { setError(''); setStep(3); }}>Skip</button>} />
          )}
        </>
      )}
      {current === 3 && (
        <>
          <h1>Check your server</h1>
          <p>These come from the server's .env file. Change them there and restart Gifty.</p>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {settings && <InstanceStatus settings={settings} />}
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryButton} onClick={() => finish('/admin?tab=invites')}>Invite someone</button>
            <button type="button" className={styles.primaryButton} onClick={() => finish('/userhome')}>Go to Gifty</button>
          </div>
        </>
      )}
    </main>
  );
}
