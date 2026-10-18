import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import axiosInstance from '../../axiosInstance';
import { useAuth } from '../../AuthContext';
import UsersPanel from '../../components/js/admin/UsersPanel';
import InvitesPanel from '../../components/js/admin/InvitesPanel';
import InstanceSettingsForm from '../../components/js/admin/InstanceSettingsForm';
import InstanceStatus from '../../components/js/admin/InstanceStatus';
import DatabaseBackups from '../../components/js/DatabaseBackups';
import styles from '../css/Admin.module.css';

const TABS = [['users', 'Users'], ['invites', 'Invites'], ['instance', 'Instance'], ['backups', 'Backups']];
const messageOf = (error) => error?.response?.data?.message || 'Something went wrong. Try again.';

function InstancePanel() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { axiosInstance.get('/admin/settings').then((r) => setSettings(r.data)).catch((e) => toast.error(messageOf(e))); }, []);
  const save = async (values) => {
    setSaving(true);
    try { setSettings((await axiosInstance.patch('/admin/settings', values)).data); toast.success('Saved.'); } catch (e) { toast.error(messageOf(e)); } finally { setSaving(false); }
  };
  if (!settings) return <p className={styles.muted}>Loading…</p>;
  return (
    <section className={styles.section} aria-labelledby="admin-instance">
      <h2 id="admin-instance">Instance</h2>
      <InstanceSettingsForm settings={settings} onSave={save} saving={saving} />
      <h3>Server</h3>
      <InstanceStatus settings={settings} />
    </section>
  );
}

// The Admin page (1b): accounts, invites, instance settings and backups.
// The server enforces every rule; the panels only leave out what it would refuse.
export default function Admin() {
  const { user: me, fetchUserProfile } = useAuth() || {};
  const isAdmin = me?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'users';
  const [setupComplete, setSetupComplete] = useState(true);

  useEffect(() => {
    if (!me?.isOwner) return;
    axiosInstance.get('/instance').then((r) => setSetupComplete(r.data?.setupComplete !== false)).catch(() => {});
  }, [me?.isOwner]);

  if (!isAdmin) {
    return (
      <main className={styles.page}>
        <h1>Admin</h1>
        <p>Only admins of this Gifty can open this page. <Link to="/userhome">Back to Home</Link></p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1>Admin</h1>
      {me.isOwner && !setupComplete && <p className={styles.notice}><Link to="/setup">Finish setting up Gifty</Link></p>}
      <div role="tablist" aria-label="Admin sections" className={styles.tabs}>
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`}
            className={tab === id ? styles.tabActive : styles.tab} onClick={() => setParams({ tab: id })}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'users' && <UsersPanel me={me} fetchUserProfile={fetchUserProfile} />}
        {tab === 'invites' && <InvitesPanel />}
        {tab === 'instance' && <InstancePanel />}
        {tab === 'backups' && <DatabaseBackups />}
      </div>
    </main>
  );
}
