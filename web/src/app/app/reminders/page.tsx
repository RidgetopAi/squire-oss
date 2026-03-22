'use client';

import { useState, useEffect } from 'react';
import { PushPermission } from '@/components/notifications';

// Use relative URLs in browser (same-origin, routed by Nginx)
const API_URL = '';

type ReminderStatus = 'pending' | 'sent' | 'acknowledged' | 'snoozed' | 'canceled' | 'failed';

interface Reminder {
  id: string;
  commitment_id: string | null;
  title: string | null;
  body: string | null;
  scheduled_for: string;
  timezone: string;
  channel: string;
  status: ReminderStatus;
  sent_at: string | null;
  acknowledged_at: string | null;
  snoozed_until: string | null;
  created_at: string;
}

const statusColors: Record<ReminderStatus, string> = {
  pending: 'bg-accent-mustard/20 text-accent-mustard border-accent-mustard/30',
  sent: 'bg-primary/20 text-primary border-primary/30',
  acknowledged: 'bg-accent-olive/20 text-accent-olive border-accent-olive/30',
  snoozed: 'bg-accent-burgundy/20 text-accent-burgundy border-accent-burgundy/30',
  canceled: 'bg-taupe/20 text-taupe border-taupe/30',
  failed: 'bg-error/20 text-error border-error/30',
};

const statusIcons: Record<ReminderStatus, string> = {
  pending: '⏰',
  sent: '📤',
  acknowledged: '✓',
  snoozed: '💤',
  canceled: '✕',
  failed: '⚠',
};

function formatScheduledTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const minutes = Math.round(diff / (1000 * 60));

  if (minutes < 0) {
    const pastMinutes = Math.abs(minutes);
    if (pastMinutes < 60) return `${pastMinutes} min ago`;
    if (pastMinutes < 1440) return `${Math.round(pastMinutes / 60)} hr ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  if (minutes < 1) return 'Now';
  if (minutes < 60) return `In ${minutes} min`;
  if (minutes < 1440) return `In ${Math.round(minutes / 60)} hr`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatFullDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function formatDueTime(dateStr: string): string {
  const date = new Date(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(2);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  const timeStr = minutes === 0 ? `${hours}${ampm}` : `${hours}:${String(minutes).padStart(2, '0')}${ampm}`;
  return `${timeStr} ${month}/${day}/${year}`;
}

function ReminderCard({
  reminder,
  onSnooze,
  onAcknowledge,
  onCancel,
}: {
  reminder: Reminder;
  onSnooze: (id: string, minutes: number) => void;
  onAcknowledge: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPast = new Date(reminder.scheduled_for) < new Date();
  const canAct = reminder.status === 'pending' || reminder.status === 'sent';

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking on action buttons
    if ((e.target as HTMLElement).closest('button')) return;
    setExpanded(!expanded);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
        isPast && canAct ? 'border-accent-mustard/50 bg-accent-mustard/5' : 'border-[var(--card-border)] bg-[var(--card-bg)]'
      } ${expanded ? 'bg-background-tertiary' : 'hover:bg-background-tertiary'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 text-xs rounded border ${statusColors[reminder.status]}`}>
              {statusIcons[reminder.status]} {reminder.status}
            </span>
            <span className="text-xs text-foreground-muted">{reminder.channel}</span>
            <span className="text-xs text-foreground-muted/60">
              {expanded ? '▼' : '▶'}
            </span>
          </div>
          <h3 className={`font-medium text-foreground ${expanded ? '' : 'truncate'}`}>
            {reminder.title || 'Commitment Reminder'}
          </h3>
          {reminder.body && (
            <p className={`text-sm text-foreground-muted mt-1 ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
              {reminder.body}
            </p>
          )}
          <div className="flex items-center justify-between mt-2">
            <p className={`text-xs ${isPast && canAct ? 'text-accent-mustard' : 'text-foreground-muted'}`}>
              {expanded
                ? formatFullDateTime(reminder.scheduled_for)
                : (<>
                    <span className="text-foreground-muted">due:{formatDueTime(reminder.scheduled_for)}</span>
                    <span className="mx-1.5 text-foreground-muted/60">·</span>
                    {formatScheduledTime(reminder.scheduled_for)}
                  </>)
              }
            </p>
            <p className="text-xs text-foreground-muted/60" title="Extracted at">
              {new Date(reminder.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
              {new Date(reminder.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-4 pt-4 border-t border-[var(--card-border)] space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-foreground-muted">Timezone:</span>{' '}
                  <span className="text-cream">{reminder.timezone}</span>
                </div>
                <div>
                  <span className="text-foreground-muted">Created:</span>{' '}
                  <span className="text-cream">
                    {new Date(reminder.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {reminder.sent_at && (
                  <div>
                    <span className="text-foreground-muted">Sent:</span>{' '}
                    <span className="text-cream">
                      {new Date(reminder.sent_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                {reminder.acknowledged_at && (
                  <div>
                    <span className="text-foreground-muted">Acknowledged:</span>{' '}
                    <span className="text-cream">
                      {new Date(reminder.acknowledged_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                {reminder.snoozed_until && (
                  <div>
                    <span className="text-foreground-muted">Snoozed until:</span>{' '}
                    <span className="text-accent-burgundy">
                      {new Date(reminder.snoozed_until).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                {reminder.commitment_id && (
                  <div className="col-span-2">
                    <span className="text-foreground-muted">Linked to commitment:</span>{' '}
                    <span className="text-primary text-xs font-mono">{reminder.commitment_id.slice(0, 8)}...</span>
                  </div>
                )}
              </div>

              {/* Extended snooze options when expanded */}
              {canAct && (
                <div className="pt-2">
                  <span className="text-xs text-foreground-muted block mb-2">Snooze for:</span>
                  <div className="flex flex-wrap gap-2">
                    {[5, 15, 30, 60, 120, 1440].map((mins) => (
                      <button
                        key={mins}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSnooze(reminder.id, mins);
                        }}
                        className="px-2 py-1 text-xs rounded bg-accent-burgundy/10 text-accent-burgundy hover:bg-accent-burgundy/20 border border-accent-burgundy/30 transition-colors"
                      >
                        {mins < 60 ? `${mins}m` : mins < 1440 ? `${mins / 60}h` : '1d'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {canAct && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAcknowledge(reminder.id);
              }}
              className="p-2 rounded hover:bg-accent-olive/20 text-accent-olive transition-colors"
              title="Acknowledge"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSnooze(reminder.id, 15);
              }}
              className="p-2 rounded hover:bg-accent-burgundy/20 text-accent-burgundy transition-colors"
              title="Snooze 15 min"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancel(reminder.id);
              }}
              className="p-2 rounded hover:bg-error/20 text-error transition-colors"
              title="Cancel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ReminderStatus | null>('pending');
  const [stats, setStats] = useState<Record<ReminderStatus, number>>({
    pending: 0, sent: 0, acknowledged: 0, snoozed: 0, canceled: 0, failed: 0
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [newReminder, setNewReminder] = useState({ title: '', body: '', scheduledFor: '' });
  const [creating, setCreating] = useState(false);

  const fetchReminders = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) {
        params.set('status', statusFilter);
      }

      const res = await fetch(`${API_URL}/api/reminders?${params}`);
      const data = await res.json();
      setReminders(data.reminders || []);
    } catch (err) {
      console.error('Failed to fetch reminders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/reminders/stats`);
      const data = await res.json();
      setStats(data.by_status || data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  useEffect(() => {
    fetchReminders();
    fetchStats();
  }, [statusFilter]);

  const handleSnooze = async (id: string, minutes: number) => {
    try {
      await fetch(`${API_URL}/api/reminders/${id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snooze_minutes: minutes }),
      });
      fetchReminders();
      fetchStats();
    } catch (err) {
      console.error('Failed to snooze:', err);
    }
  };

  const handleAcknowledge = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/reminders/${id}/acknowledge`, {
        method: 'POST',
      });
      fetchReminders();
      fetchStats();
    } catch (err) {
      console.error('Failed to acknowledge:', err);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/reminders/${id}/cancel`, {
        method: 'POST',
      });
      fetchReminders();
      fetchStats();
    } catch (err) {
      console.error('Failed to cancel:', err);
    }
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminder.title.trim() || !newReminder.scheduledFor) return;

    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/reminders/standalone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newReminder.title,
          body: newReminder.body || undefined,
          scheduled_at: new Date(newReminder.scheduledFor).toISOString(),
          timezone: 'America/New_York',
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create reminder');
      }
      setNewReminder({ title: '', body: '', scheduledFor: '' });
      setShowAddModal(false);
      fetchReminders();
      fetchStats();
    } catch (err) {
      console.error('Failed to create reminder:', err);
      alert(err instanceof Error ? err.message : 'Failed to create reminder');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusClick = (status: ReminderStatus) => {
    setStatusFilter(statusFilter === status ? null : status);
  };

  const totalCount = stats.pending + stats.snoozed + stats.acknowledged + stats.sent;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Reminders</h1>
            <p className="text-foreground-muted">Your scheduled reminders and notifications</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-foreground rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Reminder
          </button>
        </div>

        {/* Push Notification Permission */}
        <PushPermission className="mb-6" />

        {/* Stats - Clickable Filters */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <button
            onClick={() => handleStatusClick('pending')}
            className={`p-3 rounded-lg border transition-all text-left ${
              statusFilter === 'pending'
                ? 'bg-accent-mustard/30 border-accent-mustard ring-2 ring-accent-mustard/50'
                : 'bg-accent-mustard/10 border-accent-mustard/20 hover:bg-accent-mustard/20'
            }`}
          >
            <div className="text-2xl font-bold text-accent-mustard">{stats.pending}</div>
            <div className="text-xs text-foreground-muted">Pending</div>
          </button>
          <button
            onClick={() => handleStatusClick('snoozed')}
            className={`p-3 rounded-lg border transition-all text-left ${
              statusFilter === 'snoozed'
                ? 'bg-accent-burgundy/30 border-accent-burgundy ring-2 ring-accent-burgundy/50'
                : 'bg-accent-burgundy/10 border-accent-burgundy/20 hover:bg-accent-burgundy/20'
            }`}
          >
            <div className="text-2xl font-bold text-accent-burgundy">{stats.snoozed}</div>
            <div className="text-xs text-foreground-muted">Snoozed</div>
          </button>
          <button
            onClick={() => handleStatusClick('acknowledged')}
            className={`p-3 rounded-lg border transition-all text-left ${
              statusFilter === 'acknowledged'
                ? 'bg-accent-olive/30 border-accent-olive ring-2 ring-accent-olive/50'
                : 'bg-accent-olive/10 border-accent-olive/20 hover:bg-accent-olive/20'
            }`}
          >
            <div className="text-2xl font-bold text-accent-olive">{stats.acknowledged}</div>
            <div className="text-xs text-foreground-muted">Done</div>
          </button>
          <button
            onClick={() => handleStatusClick('sent')}
            className={`p-3 rounded-lg border transition-all text-left ${
              statusFilter === 'sent'
                ? 'bg-primary/30 border-primary ring-2 ring-primary/50'
                : 'bg-primary/10 border-primary/20 hover:bg-primary/20'
            }`}
          >
            <div className="text-2xl font-bold text-primary">{stats.sent}</div>
            <div className="text-xs text-foreground-muted">Sent</div>
          </button>
        </div>

        {/* Show All button when filtered */}
        {statusFilter && (
          <div className="mb-4">
            <button
              onClick={() => setStatusFilter(null)}
              className="text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              Show all ({totalCount})
            </button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="text-center py-12 text-foreground-muted">Loading...</div>
        ) : reminders.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-foreground-muted mb-2">No reminders found</div>
            <p className="text-sm text-foreground-muted/60">
              Say &quot;remind me in X minutes to...&quot; in chat to create reminders
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.map((r) => (
              <ReminderCard
                key={r.id}
                reminder={r}
                onSnooze={handleSnooze}
                onAcknowledge={handleAcknowledge}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}

        {/* Add Reminder Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] w-full max-w-md">
              <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Add Reminder</h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1 hover:bg-background-tertiary rounded text-foreground-muted hover:text-foreground"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleCreateReminder} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-cream mb-1">Title *</label>
                  <input
                    type="text"
                    value={newReminder.title}
                    onChange={(e) => setNewReminder({ ...newReminder, title: e.target.value })}
                    placeholder="What do you need to remember?"
                    className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg text-foreground placeholder-foreground-muted/50 focus:outline-none focus:border-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cream mb-1">When *</label>
                  <input
                    type="datetime-local"
                    value={newReminder.scheduledFor}
                    onChange={(e) => setNewReminder({ ...newReminder, scheduledFor: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg text-foreground focus:outline-none focus:border-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cream mb-1">Notes (optional)</label>
                  <textarea
                    value={newReminder.body}
                    onChange={(e) => setNewReminder({ ...newReminder, body: e.target.value })}
                    placeholder="Additional details..."
                    rows={3}
                    className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg text-foreground placeholder-foreground-muted/50 focus:outline-none focus:border-primary resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2 bg-background-tertiary hover:bg-foreground-muted/10 text-cream rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !newReminder.title.trim() || !newReminder.scheduledFor}
                    className="flex-1 px-4 py-2 bg-primary hover:bg-primary-hover disabled:bg-primary/50 disabled:cursor-not-allowed text-foreground rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {creating && (
                      <span className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                    )}
                    {creating ? 'Creating...' : 'Create Reminder'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
