'use client';

import { useEffect, useRef } from 'react';

export const LIVE_REFRESH_INTERVAL_MS = 5_000;

export function useLiveRefresh(refresh: () => void | Promise<void>, intervalMs = LIVE_REFRESH_INTERVAL_MS, enabled = true) {
  const refreshRef = useRef(refresh);
  const runningRef = useRef(false);

  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const run = async () => {
      if (!active || runningRef.current || !window.navigator.onLine || document.visibilityState !== 'visible') return;
      runningRef.current = true;
      try { await refreshRef.current(); }
      finally { runningRef.current = false; }
    };
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void run(); };
    const timer = window.setInterval(() => void run(), intervalMs);
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('pageshow', refreshWhenVisible);
    window.addEventListener('online', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('pageshow', refreshWhenVisible);
      window.removeEventListener('online', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [enabled, intervalMs]);
}
