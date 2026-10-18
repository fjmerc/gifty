import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import axiosInstance from '../../../axiosInstance';
import LinkBox from './LinkBox';
import styles from '../../../pages/css/Admin.module.css';

const messageOf = (error) => error?.response?.data?.message || 'Something went wrong. Try again.';
const DAYS = [[1, '1 day'], [7, '7 days'], [30, '30 days']];

export default function InvitesPanel() {
  const [pending, setPending] = useState(null);
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(7);
  const [link, setLink] = useState('');

  const load = useCallback(async () => {
    try { setPending((await axiosInstance.get('/admin/invites')).data); } catch (error) { toast.error(messageOf(error)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (event) => {
    event.preventDefault();
    try {
      const { data } = await axiosInstance.post('/admin/invites', email.trim() ? { email: email.trim(), days } : { days });
      setLink(data.link);
      setEmail('');
      await load();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  const revoke = async (id) => {
    try { await axiosInstance.delete(`/admin/invites/${id}`); } catch (error) { toast.error(messageOf(error)); }
    await load();
  };

  return (
    <section className={styles.section} aria-labelledby="admin-invites">
      <h2 id="admin-invites">Invites</h2>
      <p className={styles.muted}>An invite link lets one person create an account. They join as a member.</p>
      <form onSubmit={create} className={styles.form}>
        <label htmlFor="invite-email">Email (optional: only this address can use the link)</label>
        <input id="invite-email" type="email" className={styles.field} value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="invite-days">Expires after</label>
        <select id="invite-days" className={styles.field} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {DAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className={styles.dialogActions}><button type="submit" className={styles.primaryButton}>Create invite link</button></div>
      </form>
      {link && <LinkBox link={link} />}
      <h3>Waiting to be used</h3>
      {!pending ? <p className={styles.muted}>Loading…</p> : pending.length === 0 ? <p className={styles.muted}>No open invites.</p> : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th scope="col">For</th><th scope="col">Created by</th><th scope="col">Expires</th><th scope="col"><span className={styles.visuallyHidden}>Actions</span></th></tr></thead>
            <tbody>
              {pending.map((i) => (
                <tr key={i._id}>
                  <td>{i.email || 'Anyone'}</td>
                  <td>{i.createdBy ? `${i.createdBy.firstName} ${i.createdBy.lastName}` : '—'}</td>
                  <td>{new Date(i.expiresAt).toLocaleDateString()}</td>
                  <td><button type="button" className={styles.button} onClick={() => revoke(i._id)}>Revoke</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
