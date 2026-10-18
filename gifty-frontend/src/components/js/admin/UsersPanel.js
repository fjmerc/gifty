import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import axiosInstance from '../../../axiosInstance';
import LinkBox from './LinkBox';
import styles from '../../../pages/css/Admin.module.css';

const messageOf = (error) => error?.response?.data?.message || 'Something went wrong. Try again.';
const fullName = (u) => `${u.firstName} ${u.lastName}`;

// Accounts on this Gifty, for its admins (1b). Admins act on members; only
// the owner acts on admins; nobody acts on the owner or on themselves here.
// The server enforces the same rules, this panel only leaves out what it
// would refuse.
export default function UsersPanel({ me, fetchUserProfile }) {
  const [users, setUsers] = useState(null);
  const [handOverTo, setHandOverTo] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [resetFor, setResetFor] = useState(null); // { user, link }

  const load = useCallback(async () => {
    try {
      setUsers((await axiosInstance.get('/admin/users')).data);
    } catch (error) {
      toast.error(messageOf(error));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A change, then the list again; a 409 means someone else changed it first
  const run = async (request) => {
    try {
      await request();
      await load();
    } catch (error) {
      if (error?.response?.status === 409) {
        toast.info('This changed. The list was reloaded.');
        await load();
      } else {
        toast.error(messageOf(error));
      }
    }
  };

  const openHandOver = (u) => {
    setHandOverTo(u);
    setPassword('');
    setPasswordError('');
  };

  const handOver = async (event) => {
    event.preventDefault();
    setPasswordError('');
    try {
      await axiosInstance.post('/admin/owner', { userId: handOverTo._id, currentPassword: password });
      toast.success(`${fullName(handOverTo)} now owns this Gifty.`);
      setHandOverTo(null);
      setPassword('');
      await fetchUserProfile?.();
      await load();
    } catch (error) {
      if (error?.response?.data?.errors?.[0]?.field === 'currentPassword') {
        setPasswordError(messageOf(error));
      } else {
        toast.error(messageOf(error));
        setHandOverTo(null);
        await load();
      }
    }
  };

  // A one-time link for someone who forgot their password; shown once, in a dialog
  const makeResetLink = async (u) => {
    try {
      const { data } = await axiosInstance.post(`/admin/users/${u._id}/reset-link`);
      setResetFor({ user: u, link: data.link });
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  const actionsFor = (u) => {
    if (u.isOwner) return <span className={styles.badge}>Owner</span>;
    if (String(u._id) === String(me._id)) return <span className={styles.badge}>You</span>;
    const buttons = [];
    if (me.isOwner) {
      const role = u.role === 'admin' ? 'member' : 'admin';
      buttons.push(
        <button key="role" type="button" className={styles.button}
          onClick={() => run(() => axiosInstance.patch(`/admin/users/${u._id}/role`, { role }))}>
          {role === 'admin' ? 'Make admin' : 'Make member'}
        </button>
      );
    }
    if (u.role === 'member' || me.isOwner) {
      buttons.push(
        <button key="active" type="button" className={styles.button}
          onClick={() => run(() => axiosInstance.patch(`/admin/users/${u._id}/active`, { active: !u.active }))}>
          {u.active ? 'Deactivate' : 'Reactivate'}
        </button>
      );
    }
    if (u.active && (u.role === 'member' || me.isOwner)) {
      buttons.push(
        <button key="reset" type="button" className={styles.button} onClick={() => makeResetLink(u)}>Reset password</button>
      );
    }
    if (me.isOwner && u.active) {
      buttons.push(
        <button key="owner" type="button" className={styles.button} onClick={() => openHandOver(u)}>
          Make owner
        </button>
      );
    }
    return <div className={styles.actions}>{buttons}</div>;
  };

  return (
    <>
      <section className={styles.section} aria-labelledby="admin-users">
        <h2 id="admin-users">Users</h2>
        {!users ? <p className={styles.muted}>Loading…</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Joined</th>
                  <th scope="col"><span className={styles.visuallyHidden}>Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td>{fullName(u)}</td>
                    <td>{u.email}</td>
                    <td>{u.role === 'admin' ? 'Admin' : 'Member'}</td>
                    <td>{u.active ? 'Active' : 'Deactivated'}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>{actionsFor(u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {handOverTo && (
        <div className={styles.backdrop}>
          <div role="dialog" aria-modal="true" aria-labelledby="handover-title" className={styles.dialog}>
            <form onSubmit={handOver}>
              <h2 id="handover-title">Make {fullName(handOverTo)} the owner?</h2>
              <p>They get every owner right, including handing ownership on. You stay an admin.</p>
              <label htmlFor="handover-password">Current password</label>
              <input
                id="handover-password"
                className={styles.field}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError ? 'handover-error' : undefined}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
              {passwordError && <p id="handover-error" role="alert" className={styles.error}>{passwordError}</p>}
              <div className={styles.dialogActions}>
                <button type="button" className={styles.button} onClick={() => setHandOverTo(null)}>Cancel</button>
                <button type="submit" className={styles.primaryButton}>Hand over</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetFor && (
        <div className={styles.backdrop}>
          <div role="dialog" aria-modal="true" aria-labelledby="reset-title" className={styles.dialog}>
            <h2 id="reset-title">Reset link for {fullName(resetFor.user)}</h2>
            <p>It works once, for 24 hours, and replaces any earlier link. Opening it lets them choose a new password.</p>
            <LinkBox link={resetFor.link} />
            <div className={styles.dialogActions}>
              <button type="button" className={styles.primaryButton} onClick={() => setResetFor(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
