import React, { useEffect, useState } from 'react';
import styles from '../../../pages/css/Admin.module.css';

const OPEN_WARNING = 'Anyone who can open this address can create an account. Use this only on a private network.';

// Sign-up mode and the defaults new accounts start with (wizard step 2, Admin › Instance)
export default function InstanceSettingsForm({ settings, onSave, saving = false, submitLabel = 'Save', extraActions = null }) {
  const [values, setValues] = useState({ signupMode: settings.signupMode, defaultCountry: settings.defaultCountry, defaultCurrency: settings.defaultCurrency });
  useEffect(() => {
    setValues({ signupMode: settings.signupMode, defaultCountry: settings.defaultCountry, defaultCurrency: settings.defaultCurrency });
  }, [settings.signupMode, settings.defaultCountry, settings.defaultCurrency]);
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(values); }} className={styles.form}>
      <label htmlFor="instance-country">Holiday country</label>
      <select id="instance-country" className={styles.field} value={values.defaultCountry} onChange={set('defaultCountry')}>
        {settings.choices.countries.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <label htmlFor="instance-currency">Currency</label>
      <select id="instance-currency" className={styles.field} value={values.defaultCurrency} onChange={set('defaultCurrency')}>
        {settings.choices.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <fieldset className={styles.fieldset}>
        <legend>Who can create an account</legend>
        <label><input type="radio" name="signupMode" value="invite-only" checked={values.signupMode === 'invite-only'} onChange={set('signupMode')} /> Invite only</label>
        <label><input type="radio" name="signupMode" value="open" checked={values.signupMode === 'open'} onChange={set('signupMode')} /> Open: anyone who can reach this address can create an account</label>
        {values.signupMode === 'open' && <p role="alert" className={styles.warning}>{OPEN_WARNING}</p>}
      </fieldset>
      <p className={styles.muted}>New accounts start with this country's holidays and this currency. Existing accounts keep their own.</p>
      <div className={styles.dialogActions}>
        {extraActions}
        <button type="submit" className={styles.primaryButton} disabled={saving}>{submitLabel}</button>
      </div>
    </form>
  );
}
