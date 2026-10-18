import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import RegisterForm from '../../components/js/RegisterForm';
import axiosInstance from '../../axiosInstance';
import styles from '../css/Register.module.css';

const INVITE_ONLY = 'This Gifty is invite-only. Ask someone who uses it for an invite link.';

// /register: open sign-up only. A fresh instance goes to the setup wizard;
// an invite-only one explains how to join (invite links open /invite/…)
const Register = () => {
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    // Fresh each visit (not the cached instance info): it changes with the first account and the sign-up mode
    Promise.resolve()
      .then(() => axiosInstance.get('/instance'))
      .then((res) => { if (alive) setInfo(res?.data || {}); })
      .catch(() => { if (alive) setInfo({}); }); // the server still decides
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (info?.setupRequired) navigate('/setup', { replace: true });
  }, [info, navigate]);

  if (!info || info.setupRequired) return <div className={styles['register-container']}><p role="status">Loading…</p></div>;
  if (info.signupMode === 'invite-only') {
    return (
      <div className={styles['register-container']}>
        <div className={styles['register-form']}>
          <h1>Create Account</h1>
          <p>{INVITE_ONLY}</p>
          <Link to="/login" className={styles['login-link']}>Already have an account? Sign in</Link>
        </div>
      </div>
    );
  }
  return (
    <div className={styles['register-container']}>
      <RegisterForm onRegistered={() => navigate('/login')} />
    </div>
  );
};

export default Register;
