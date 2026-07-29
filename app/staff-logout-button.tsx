'use client';

import { useState } from 'react';

export function StaffLogoutButton({ clearSessionStorageKeys = [] }: { clearSessionStorageKeys?: string[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function logout() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin-logout', { method: 'POST' });
      if (!response.ok) throw new Error('logout_failed');
      try { for (const key of clearSessionStorageKeys) window.sessionStorage.removeItem(key); } catch {}
      window.location.assign('/admin');
    } catch { setError('安全退出失败，请重试'); setBusy(false); }
  }

  return <span className="staff-logout-wrap"><button type="button" className="staff-logout-button" disabled={busy} onClick={() => void logout()}>{busy ? '退出中…' : '安全退出'}</button>{error && <small role="alert">{error}</small>}</span>;
}
