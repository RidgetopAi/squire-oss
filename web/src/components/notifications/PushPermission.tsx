'use client';

import { useState } from 'react';
import { usePushNotifications } from '@/lib/hooks';

interface PushPermissionProps {
  /** Compact mode - just icon button */
  compact?: boolean;
  /** Custom class name */
  className?: string;
  /** Callback when subscription state changes */
  onStateChange?: (subscribed: boolean) => void;
}

export function PushPermission({
  compact = false,
  className = '',
  onStateChange,
}: PushPermissionProps) {
  const {
    isSupported,
    isRegistered,
    permission,
    isSubscribed,
    isLoading,
    error,
    requestPermission,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const [showError, setShowError] = useState(false);

  // Handle subscribe/unsubscribe toggle
  const handleToggle = async () => {
    setShowError(false);

    if (isSubscribed) {
      const success = await unsubscribe();
      if (success) {
        onStateChange?.(false);
      } else {
        setShowError(true);
      }
    } else {
      // First ensure permission
      if (permission !== 'granted') {
        const newPermission = await requestPermission();
        if (newPermission !== 'granted') {
          setShowError(true);
          return;
        }
      }

      const success = await subscribe();
      if (success) {
        onStateChange?.(true);
      } else {
        setShowError(true);
      }
    }
  };

  // Not supported - show nothing or disabled state
  if (!isSupported) {
    if (compact) return null;
    return (
      <div className={`text-sm text-gray-500 ${className}`}>
        Push notifications not supported in this browser
      </div>
    );
  }

  // Permission denied - show how to enable
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

  if (permission === 'denied') {
    if (compact) {
      return (
        <button
          disabled
          className={`p-2 rounded-lg bg-gray-800/50 text-gray-500 cursor-not-allowed ${className}`}
          title="Notifications blocked - enable in browser settings"
        >
          <BellOffIcon className="w-5 h-5" />
        </button>
      );
    }
    return (
      <div className={`p-4 rounded-lg bg-gray-800/50 border border-gray-700 ${className}`}>
        <div className="flex items-start gap-3">
          <BellOffIcon className="w-6 h-6 text-gray-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-gray-300">Notifications blocked</p>
            {isIOS ? (
              <div className="text-xs text-gray-500 mt-1 space-y-1">
                <p>To fix on iOS:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Close this app completely (swipe up)</li>
                  <li>Go to Settings → Squire → Notifications</li>
                  <li>Toggle OFF, wait 5 seconds, toggle ON</li>
                  <li>Re-open Squire from home screen</li>
                </ol>
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                Enable in browser settings to receive reminders
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Compact mode - just a toggle button
  if (compact) {
    return (
      <button
        onClick={handleToggle}
        disabled={isLoading || !isRegistered}
        className={`
          p-2 rounded-lg transition-all duration-200
          ${isSubscribed
            ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
            : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
          }
          ${isLoading ? 'opacity-50 cursor-wait' : ''}
          ${!isRegistered ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}
        `}
        title={isSubscribed ? 'Notifications enabled' : 'Enable notifications'}
      >
        {isLoading ? (
          <LoadingSpinner className="w-5 h-5" />
        ) : isSubscribed ? (
          <BellIcon className="w-5 h-5" />
        ) : (
          <BellOffIcon className="w-5 h-5" />
        )}
      </button>
    );
  }

  // Full card mode
  return (
    <div className={`p-4 rounded-lg bg-gray-800/50 border border-gray-700 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isSubscribed ? (
            <BellIcon className="w-6 h-6 text-cyan-400" />
          ) : (
            <BellOffIcon className="w-6 h-6 text-gray-500" />
          )}
          <div>
            <p className="text-sm font-medium text-gray-200">
              Push Notifications
            </p>
            <p className="text-xs text-gray-500">
              {isSubscribed
                ? 'Receiving reminder notifications'
                : 'Enable to receive reminder alerts'}
            </p>
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={isLoading || !isRegistered}
          className={`
            px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
            ${isSubscribed
              ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              : 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
            }
            ${isLoading ? 'opacity-50 cursor-wait' : ''}
            ${!isRegistered ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner className="w-4 h-4" />
              {isSubscribed ? 'Disabling...' : 'Enabling...'}
            </span>
          ) : isSubscribed ? (
            'Disable'
          ) : (
            'Enable'
          )}
        </button>
      </div>

      {/* Error display */}
      {(showError || error) && (
        <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400">
            {error || 'Failed to update notification settings'}
          </p>
        </div>
      )}
    </div>
  );
}

// === Icon Components ===

function BellIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

function BellOffIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
      <line x1="2" y1="2" x2="22" y2="22" strokeLinecap="round" />
    </svg>
  );
}

function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export default PushPermission;
