import { useEffect, useState } from 'react';
import axiosInstance from '../axiosInstance';

const FALLBACK = { version: 'unknown', features: { ai: true, email: true, webSearch: true } };
let pending = null;

export function fetchInstanceInfo() {
  if (!pending) {
    // Promise.resolve().then: a synchronous throw or non-promise from the
    // client still lands in the fallback instead of crashing the page
    pending = Promise.resolve()
      .then(() => axiosInstance.get('/instance'))
      .then((res) => res.data)
      .catch(() => {
        pending = null; // retry on next call
        return FALLBACK;
      });
  }
  return pending;
}

export function resetInstanceInfoCache() {
  pending = null;
}

export function useInstanceInfo() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchInstanceInfo().then((data) => { if (alive) setInfo(data); });
    return () => { alive = false; };
  }, []);
  return info;
}
