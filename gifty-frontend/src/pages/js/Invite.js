import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import RegisterForm from '../../components/js/RegisterForm';
import axiosInstance from '../../axiosInstance';
import styles from '../css/Register.module.css';

const FALLBACK = "This invite link isn't valid. Ask for a new one.";

// /invite/:token: register as a member with a one-time invite
export default function Invite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => axiosInstance.get(`/invites/${encodeURIComponent(token)}`))
      .then((res) => { if (alive) setState({ invite: res.data }); })
      .catch((error) => { if (alive) setState({ problem: error?.response?.data?.message || FALLBACK }); });
    return () => { alive = false; };
  }, [token]);

  if (state.loading) return <div className={styles['register-container']}><p role="status">Loading…</p></div>;
  if (state.problem) {
    return (
      <div className={styles['register-container']}>
        <div className={styles['register-form']}>
          <h1>Join Gifty</h1>
          <p role="alert">{state.problem}</p>
          <Link to="/login" className={styles['login-link']}>Already have an account? Sign in</Link>
        </div>
      </div>
    );
  }
  return (
    <div className={styles['register-container']}>
      <RegisterForm inviteToken={token} lockedEmail={state.invite.email} onRegistered={() => navigate('/login')} />
    </div>
  );
}
