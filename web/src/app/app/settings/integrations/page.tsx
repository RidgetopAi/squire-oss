'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { GoogleAccount, GoogleCalendar, GoogleConnectionStatus } from '@/lib/types';

// Use relative URLs in browser (same-origin, routed by Nginx)
const API_URL = '';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface AccountCardProps {
  account: GoogleAccount;
  calendars: GoogleCalendar[];
  onDisconnect: (id: string) => void;
  onSync: (id: string) => void;
  onCalendarUpdate: (calendarId: string, settings: Partial<GoogleCalendar>) => void;
  syncing: boolean;
}

function AccountCard({ account, calendars, onDisconnect, onSync, onCalendarUpdate, syncing }: AccountCardProps) {
  const [showCalendars, setShowCalendars] = useState(false);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [calendarList, setCalendarList] = useState<GoogleCalendar[]>(calendars);

  const loadCalendars = async () => {
    if (calendarList.length > 0) {
      setShowCalendars(!showCalendars);
      return;
    }
    setLoadingCalendars(true);
    try {
      const res = await fetch(`${API_URL}/api/integrations/google/calendars/${account.id}`);
      const data = await res.json();
      setCalendarList(data.calendars || []);
      setShowCalendars(true);
    } catch (err) {
      console.error('Failed to load calendars:', err);
    } finally {
      setLoadingCalendars(false);
    }
  };

  const handleCalendarToggle = async (cal: GoogleCalendar) => {
    const newEnabled = !cal.sync_enabled;
    try {
      await fetch(`${API_URL}/api/integrations/google/calendars/settings/${cal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_enabled: newEnabled }),
      });
      setCalendarList(prev =>
        prev.map(c => c.id === cal.id ? { ...c, sync_enabled: newEnabled } : c)
      );
      onCalendarUpdate(cal.id, { sync_enabled: newEnabled });
    } catch (err) {
      console.error('Failed to update calendar:', err);
    }
  };

  const handleSetDefault = async (cal: GoogleCalendar) => {
    try {
      await fetch(`${API_URL}/api/integrations/google/calendars/settings/${cal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default_for_push: true }),
      });
      setCalendarList(prev =>
        prev.map(c => ({ ...c, is_default_for_push: c.id === cal.id }))
      );
    } catch (err) {
      console.error('Failed to set default calendar:', err);
    }
  };

  return (
    <div className="border border-white/10 rounded-lg bg-white/5 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            </div>
            <div>
              <div className="font-medium text-white">{account.email}</div>
              {account.display_name && (
                <div className="text-sm text-gray-400">{account.display_name}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs rounded ${
              account.sync_enabled
                ? 'bg-green-500/20 text-green-400'
                : 'bg-gray-500/20 text-gray-400'
            }`}>
              {account.sync_enabled ? 'Syncing' : 'Paused'}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
          <span>Last synced: {formatDate(account.last_full_sync_at)}</span>
          <span>|</span>
          <span>Connected: {formatDate(account.created_at)}</span>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={loadCalendars}
            disabled={loadingCalendars}
            className="px-3 py-1.5 text-sm rounded bg-white/5 hover:bg-white/10 text-gray-300 transition-colors flex items-center gap-1"
          >
            {loadingCalendars ? (
              <span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className={`w-4 h-4 transition-transform ${showCalendars ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
            {showCalendars ? 'Hide' : 'Show'} Calendars
          </button>
          <button
            onClick={() => onSync(account.id)}
            disabled={syncing}
            className="px-3 py-1.5 text-sm rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors flex items-center gap-1"
          >
            {syncing ? (
              <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Sync Now
          </button>
          <button
            onClick={() => onDisconnect(account.id)}
            className="px-3 py-1.5 text-sm rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>

      {showCalendars && calendarList.length > 0 && (
        <div className="border-t border-white/10 p-4 space-y-2">
          <div className="text-sm font-medium text-gray-400 mb-3">Calendars</div>
          {calendarList.map(cal => (
            <div
              key={cal.id}
              className="flex items-center justify-between p-2 rounded bg-white/5 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: cal.background_color || '#4285f4' }}
                />
                <div>
                  <div className="text-sm text-white">{cal.name}</div>
                  {cal.is_primary && (
                    <span className="text-xs text-gray-500">Primary</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {cal.is_default_for_push && (
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
                    Push Target
                  </span>
                )}
                {!cal.is_default_for_push && cal.sync_enabled && (
                  <button
                    onClick={() => handleSetDefault(cal)}
                    className="text-xs text-gray-500 hover:text-purple-400 transition-colors"
                  >
                    Set as Push Target
                  </button>
                )}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cal.sync_enabled}
                    onChange={() => handleCalendarToggle(cal)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IntegrationsContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GoogleConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/integrations/google/status`);
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch status:', err);
      setStatus({ configured: false, accounts: [], error: 'Failed to connect to server' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Check for OAuth callback results
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');

    if (connected) {
      setMessage({ type: 'success', text: `Connected ${connected} successfully!` });
      // Clean URL
      window.history.replaceState({}, '', '/app/settings/integrations');
    } else if (error) {
      setMessage({ type: 'error', text: `Connection failed: ${error}` });
      window.history.replaceState({}, '', '/app/settings/integrations');
    }
  }, [fetchStatus, searchParams]);

  const handleConnect = () => {
    // Redirect to OAuth
    window.location.href = `${API_URL}/api/integrations/google/auth`;
  };

  const handleDisconnect = async (accountId: string) => {
    if (!confirm('Are you sure you want to disconnect this Google account? This will remove all synced calendars and events.')) {
      return;
    }

    try {
      await fetch(`${API_URL}/api/integrations/google/disconnect/${accountId}`, {
        method: 'DELETE',
      });
      await fetchStatus();
      setMessage({ type: 'success', text: 'Account disconnected' });
    } catch (err) {
      console.error('Failed to disconnect:', err);
      setMessage({ type: 'error', text: 'Failed to disconnect account' });
    }
  };

  const handleSync = async (accountId: string) => {
    setSyncing(accountId);
    try {
      await fetch(`${API_URL}/api/integrations/google/sync/${accountId}`, {
        method: 'POST',
      });
      await fetchStatus();
      setMessage({ type: 'success', text: 'Sync completed!' });
    } catch (err) {
      console.error('Failed to sync:', err);
      setMessage({ type: 'error', text: 'Sync failed' });
    } finally {
      setSyncing(null);
    }
  };

  const handleCalendarUpdate = () => {
    // Refresh status after calendar changes
    fetchStatus();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
            <a href="/app/settings" className="hover:text-white transition-colors">Settings</a>
            <span>/</span>
            <span className="text-white">Integrations</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Integrations</h1>
          <p className="text-gray-400">Connect external services to sync calendars and data</p>
        </div>

        {/* Message Toast */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {message.text}
            </div>
            <button onClick={() => setMessage(null)} className="p-1 hover:bg-white/10 rounded">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Google Calendar Section */}
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-white/10 bg-white/5">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-white">Google Calendar</h2>
                <p className="text-sm text-gray-400">
                  Sync your Google Calendar events with Squire for a unified view
                </p>
              </div>
              {status?.configured && (
                <button
                  onClick={handleConnect}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Account
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !status?.configured ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-2">Not Configured</h3>
                <p className="text-gray-400 text-sm max-w-md mx-auto">
                  Google Calendar integration requires configuration.
                  Set <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs">GOOGLE_CLIENT_ID</code> and{' '}
                  <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs">GOOGLE_CLIENT_SECRET</code> in the server environment.
                </p>
              </div>
            ) : status.accounts.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No Accounts Connected</h3>
                <p className="text-gray-400 text-sm mb-6">
                  Connect your Google account to sync calendar events with Squire
                </p>
                <button
                  onClick={handleConnect}
                  className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium flex items-center gap-2 mx-auto"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Connect Google Account
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {status.accounts.map(account => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    calendars={[]}
                    onDisconnect={handleDisconnect}
                    onSync={handleSync}
                    onCalendarUpdate={handleCalendarUpdate}
                    syncing={syncing === account.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Future Integrations Placeholder */}
          <div className="p-6 rounded-xl border border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gray-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-400">More Integrations Coming Soon</h3>
                <p className="text-sm text-gray-500">Apple Calendar, Outlook, and more</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntegrationsLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <div className="h-4 w-32 bg-gray-700 rounded mb-4" />
          <div className="h-8 w-48 bg-gray-700 rounded mb-2" />
          <div className="h-4 w-64 bg-gray-700 rounded" />
        </div>
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<IntegrationsLoading />}>
      <IntegrationsContent />
    </Suspense>
  );
}
