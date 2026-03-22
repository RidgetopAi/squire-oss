'use client';

import { useState, useEffect } from 'react';
import { Commitment, CommitmentStatus } from '@/lib/types';

// Use relative URLs in browser (same-origin, routed by Nginx)
const API_URL = '';

const statusColors: Record<CommitmentStatus, string> = {
  open: 'bg-accent-mustard/20 text-accent-mustard border-accent-mustard/30',
  in_progress: 'bg-primary/20 text-primary border-primary/30',
  completed: 'bg-accent-olive/20 text-accent-olive border-accent-olive/30',
  canceled: 'bg-taupe/20 text-taupe border-taupe/30',
  snoozed: 'bg-accent-burgundy/20 text-accent-burgundy border-accent-burgundy/30',
};

const statusIcons: Record<CommitmentStatus, string> = {
  open: '○',
  in_progress: '◐',
  completed: '●',
  canceled: '✕',
  snoozed: '◑',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No due date';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 7) return `Due in ${days} days`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function CommitmentCard({
  commitment,
  onResolve,
  onSnooze
}: {
  commitment: Commitment;
  onResolve: (id: string, type: string) => void;
  onSnooze: (id: string) => void;
}) {
  const isOverdue = commitment.due_at && new Date(commitment.due_at) < new Date() &&
    commitment.status !== 'completed' && commitment.status !== 'canceled';

  return (
    <div className={`p-4 rounded-lg border ${isOverdue ? 'border-error/50 bg-error/5' : 'border-[var(--card-border)] bg-[var(--card-bg)]'} hover:bg-background-tertiary transition-colors`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 text-xs rounded border ${statusColors[commitment.status]}`}>
              {statusIcons[commitment.status]} {commitment.status.replace('_', ' ')}
            </span>
            {commitment.source_type === 'chat' && (
              <span className="text-xs text-foreground-muted">from chat</span>
            )}
          </div>
          <h3 className="font-medium text-foreground truncate">{commitment.title}</h3>
          {commitment.description && (
            <p className="text-sm text-foreground-muted mt-1 line-clamp-2">{commitment.description}</p>
          )}
          <div className="flex items-center justify-between mt-2">
            <p className={`text-xs ${isOverdue ? 'text-error' : 'text-foreground-muted'}`}>
              {formatDate(commitment.due_at)}
            </p>
            <p className="text-xs text-foreground-muted/60" title="Extracted at">
              {new Date(commitment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
              {new Date(commitment.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
        </div>
        {commitment.status !== 'completed' && commitment.status !== 'canceled' && (
          <div className="flex gap-1">
            <button
              onClick={() => onResolve(commitment.id, 'completed')}
              className="p-2 rounded hover:bg-accent-olive/20 text-accent-olive transition-colors"
              title="Mark complete"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              onClick={() => onSnooze(commitment.id)}
              className="p-2 rounded hover:bg-accent-burgundy/20 text-accent-burgundy transition-colors"
              title="Snooze 1 day"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommitmentsPage() {
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<CommitmentStatus | null>('open');
  const [stats, setStats] = useState<Record<CommitmentStatus, number>>({ open: 0, in_progress: 0, completed: 0, canceled: 0, snoozed: 0 });

  const fetchCommitments = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) {
        params.set('status', statusFilter);
        if (statusFilter === 'completed' || statusFilter === 'canceled') {
          params.set('include_resolved', 'true');
        }
      } else {
        params.set('include_resolved', 'true');
      }

      const res = await fetch(`${API_URL}/api/commitments?${params}`);
      const data = await res.json();
      setCommitments(data.commitments || []);
    } catch (err) {
      console.error('Failed to fetch commitments:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/commitments/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  useEffect(() => {
    fetchCommitments();
    fetchStats();
  }, [statusFilter]);

  const handleResolve = async (id: string, resolutionType: string) => {
    try {
      await fetch(`${API_URL}/api/commitments/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_type: resolutionType }),
      });
      fetchCommitments();
      fetchStats();
    } catch (err) {
      console.error('Failed to resolve:', err);
    }
  };

  const handleSnooze = async (id: string) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    try {
      await fetch(`${API_URL}/api/commitments/${id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snooze_until: tomorrow.toISOString() }),
      });
      fetchCommitments();
      fetchStats();
    } catch (err) {
      console.error('Failed to snooze:', err);
    }
  };

  const handleStatusClick = (status: CommitmentStatus) => {
    setStatusFilter(statusFilter === status ? null : status);
  };

  const totalCount = stats.open + stats.in_progress + stats.completed + stats.snoozed;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Commitments</h1>
          <p className="text-foreground-muted">Track your goals, tasks, and promises</p>
        </div>

        {/* Stats - Clickable Filters */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <button
            onClick={() => handleStatusClick('open')}
            className={`p-3 rounded-lg border transition-all text-left ${
              statusFilter === 'open'
                ? 'bg-accent-mustard/30 border-accent-mustard ring-2 ring-accent-mustard/50'
                : 'bg-accent-mustard/10 border-accent-mustard/20 hover:bg-accent-mustard/20'
            }`}
          >
            <div className="text-2xl font-bold text-accent-mustard">{stats.open}</div>
            <div className="text-xs text-foreground-muted">Open</div>
          </button>
          <button
            onClick={() => handleStatusClick('in_progress')}
            className={`p-3 rounded-lg border transition-all text-left ${
              statusFilter === 'in_progress'
                ? 'bg-primary/30 border-primary ring-2 ring-primary/50'
                : 'bg-primary/10 border-primary/20 hover:bg-primary/20'
            }`}
          >
            <div className="text-2xl font-bold text-primary">{stats.in_progress}</div>
            <div className="text-xs text-foreground-muted">In Progress</div>
          </button>
          <button
            onClick={() => handleStatusClick('completed')}
            className={`p-3 rounded-lg border transition-all text-left ${
              statusFilter === 'completed'
                ? 'bg-accent-olive/30 border-accent-olive ring-2 ring-accent-olive/50'
                : 'bg-accent-olive/10 border-accent-olive/20 hover:bg-accent-olive/20'
            }`}
          >
            <div className="text-2xl font-bold text-accent-olive">{stats.completed}</div>
            <div className="text-xs text-foreground-muted">Completed</div>
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
        ) : commitments.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-foreground-muted mb-2">No commitments found</div>
            <p className="text-sm text-foreground-muted/60">
              Commitments are created automatically when you mention goals or tasks in chat
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {commitments.map((c) => (
              <CommitmentCard
                key={c.id}
                commitment={c}
                onResolve={handleResolve}
                onSnooze={handleSnooze}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
