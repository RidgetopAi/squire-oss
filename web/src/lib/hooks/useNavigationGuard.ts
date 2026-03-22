/**
 * Navigation Guard Hook
 *
 * Prevents accidental navigation when there are unsaved changes or
 * ongoing operations that could result in data loss.
 */

import { useEffect, useCallback } from 'react';

interface UseNavigationGuardOptions {
  /** Whether the guard is active */
  enabled: boolean;
  /** Message to show in the browser's confirmation dialog */
  message?: string;
  /** Optional callback when navigation is attempted */
  onNavigationAttempt?: () => void;
}

/**
 * Hook to prevent navigation when there are unsaved changes
 * Uses the browser's beforeunload event
 */
export function useNavigationGuard({
  enabled,
  message = 'You have unsaved changes. Are you sure you want to leave?',
  onNavigationAttempt,
}: UseNavigationGuardOptions): void {
  const handleBeforeUnload = useCallback(
    (e: BeforeUnloadEvent) => {
      if (!enabled) return;

      onNavigationAttempt?.();

      // Standard way to show confirmation dialog
      e.preventDefault();
      // Chrome requires returnValue to be set
      e.returnValue = message;
      return message;
    },
    [enabled, message, onNavigationAttempt]
  );

  useEffect(() => {
    if (enabled) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [enabled, handleBeforeUnload]);
}

/**
 * Hook specifically for chat navigation protection
 * Integrates with the chat store's busy state
 */
export function useChatNavigationGuard(): void {
  // Import dynamically to avoid circular dependency
  const { useIsChatBusy } = require('@/lib/stores/chatStore');
  const isBusy = useIsChatBusy();

  useNavigationGuard({
    enabled: isBusy,
    message:
      'Your message is still being processed. Leaving now may cause data loss. Are you sure?',
  });
}

/**
 * Hook specifically for consolidation navigation protection
 */
export function useConsolidationNavigationGuard(isConsolidating: boolean): void {
  useNavigationGuard({
    enabled: isConsolidating,
    message:
      'Memory consolidation is in progress. Please wait for it to complete before navigating away.',
  });
}
