'use client';

import { useState } from 'react';
import { useConsolidation, formatConsolidationResult } from '@/lib/hooks/useConsolidation';
import { useConsolidationNavigationGuard } from '@/lib/hooks/useNavigationGuard';
import type { ConsolidationResult } from '@/lib/api/consolidation';

export default function SettingsPage() {
  const consolidation = useConsolidation();
  const [lastResult, setLastResult] = useState<ConsolidationResult | null>(null);

  // Prevent navigation during consolidation
  useConsolidationNavigationGuard(consolidation.isPending);

  const handleSleep = async () => {
    try {
      const result = await consolidation.mutateAsync();
      setLastResult(result);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="text-center space-y-6 animate-fade-in max-w-lg">
        {/* Header */}
        <div className="space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-foreground-muted/10 border border-foreground-muted/30 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-foreground-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-foreground-muted">
            Configure your Squire experience.
          </p>
        </div>

        {/* Sleep/Consolidate Section */}
        <div className="glass rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-purple/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-accent-purple"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            </div>
            <div className="text-left">
              <h2 className="font-semibold text-foreground">Sleep & Consolidate</h2>
              <p className="text-sm text-foreground-muted">
                Process conversations into memories
              </p>
            </div>
          </div>

          <p className="text-sm text-foreground-muted text-left">
            This extracts memorable information from your chat history,
            strengthens important memories, and discovers patterns.
            Happens automatically after 1 hour of inactivity.
          </p>

          <button
            onClick={handleSleep}
            disabled={consolidation.isPending}
            className={`
              w-full px-4 py-3 rounded-lg font-medium
              flex items-center justify-center gap-2
              transition-all duration-200
              ${consolidation.isPending
                ? 'bg-accent-purple/30 text-foreground-muted cursor-not-allowed'
                : 'bg-accent-purple hover:bg-accent-purple/90 text-white'
              }
            `}
          >
            {consolidation.isPending ? (
              <>
                <span className="flex gap-1">
                  <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                <span>Consolidating...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
                <span>Sleep Now</span>
              </>
            )}
          </button>

          {/* Success Result */}
          {lastResult && consolidation.isSuccess && (
            <div className="bg-accent-success/10 border border-accent-success/30 rounded-lg p-3 text-left">
              <div className="flex items-center gap-2 text-accent-success font-medium text-sm mb-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Consolidation Complete
              </div>
              <p className="text-sm text-foreground-muted">
                {formatConsolidationResult(lastResult)}
              </p>
              <p className="text-xs text-foreground-muted/70 mt-1">
                Completed in {(lastResult.durationMs / 1000).toFixed(1)}s
              </p>
            </div>
          )}

          {/* Error Result */}
          {consolidation.isError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-left">
              <div className="flex items-center gap-2 text-red-400 font-medium text-sm mb-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Consolidation Failed
              </div>
              <p className="text-sm text-foreground-muted">
                {consolidation.error instanceof Error
                  ? consolidation.error.message
                  : 'An unexpected error occurred'}
              </p>
            </div>
          )}
        </div>

        {/* Integrations Section */}
        <div className="glass rounded-xl p-6 space-y-4">
          <a
            href="/app/settings/integrations"
            className="flex items-center gap-3 hover:bg-background-tertiary p-3 -m-3 rounded-lg transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
            </div>
            <div className="text-left flex-1">
              <h2 className="font-semibold text-foreground">Integrations</h2>
              <p className="text-sm text-foreground-muted">
                Connect Google Calendar and other services
              </p>
            </div>
            <svg
              className="w-5 h-5 text-foreground-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </a>
        </div>

        {/* Placeholder for other settings */}
        <p className="text-foreground-muted/50 text-sm">
          More settings coming soon: profiles, preferences, and API keys.
        </p>
      </div>
    </div>
  );
}
