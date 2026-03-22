'use client';

import { useState, useEffect } from 'react';
import { BottomNav } from './BottomNav';
import { ToastProvider, useToast } from '@/components/shared/Toast';
import { useWebSocket } from '@/lib/hooks';
import { useChatNavigationGuard } from '@/lib/hooks/useNavigationGuard';

interface AppLayoutProps {
  children: React.ReactNode;
}

// Component that listens for socket events and shows toasts
function SocketToastListener() {
  const { showToast } = useToast();
  const { onCommitmentCreated, onReminderCreated } = useWebSocket();

  useEffect(() => {
    const unsubCommitment = onCommitmentCreated((data) => {
      showToast(`Scheduled: ${data.title}`, 'success', 6000);
    });

    const unsubReminder = onReminderCreated((data) => {
      showToast(`Reminder set: ${data.title}`, 'info', 6000);
    });

    return () => {
      unsubCommitment();
      unsubReminder();
    };
  }, [onCommitmentCreated, onReminderCreated, showToast]);

  return null;
}

// Component that provides navigation protection and message recovery
function NavigationGuardProvider() {
  useChatNavigationGuard();
  return null;
}

// Component that checks for and displays orphaned messages on load
function MessageRecoveryProvider() {
  const { showToast } = useToast();
  const [recoveredMessages, setRecoveredMessages] = useState<Array<{ id: string; content: string }>>([]);
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);

  useEffect(() => {
    const checkOrphanedMessages = async () => {
      const { useChatStore } = await import('@/lib/stores/chatStore');
      const orphaned = useChatStore.getState().recoverOrphanedMessages();

      if (orphaned.length > 0) {
        setRecoveredMessages(orphaned.map((m) => ({ id: m.id, content: m.content })));
        setShowRecoveryBanner(true);
        showToast(
          `Found ${orphaned.length} unsent message(s) from your last session`,
          'info',
          10000
        );
      }
    };

    const timeout = setTimeout(checkOrphanedMessages, 500);
    return () => clearTimeout(timeout);
  }, [showToast]);

  const handleDismiss = async () => {
    const { useChatStore } = await import('@/lib/stores/chatStore');
    useChatStore.getState().clearPendingBackup();
    setShowRecoveryBanner(false);
    setRecoveredMessages([]);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    showToast('Message copied to clipboard', 'success', 3000);
  };

  if (!showRecoveryBanner || recoveredMessages.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-16 right-4 z-50 max-w-md animate-fade-in">
      <div className="bg-accent-mustard/10 border border-accent-mustard/30 rounded-lg p-4 shadow-lg backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-8 h-8 rounded-full bg-accent-mustard/20 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-accent-mustard"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-accent-mustard text-sm">
              Recovered Message{recoveredMessages.length > 1 ? 's' : ''}
            </h3>
            <p className="text-foreground-muted text-xs mt-1">
              {recoveredMessages.length === 1
                ? 'A message was not saved before you left.'
                : `${recoveredMessages.length} messages were not saved before you left.`}
            </p>
            <div className="mt-3 space-y-2 max-h-32 overflow-y-auto">
              {recoveredMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="bg-background-secondary/50 rounded-lg p-2 text-xs text-foreground-muted"
                >
                  <p className="line-clamp-2">{msg.content}</p>
                  <button
                    onClick={() => handleCopy(msg.content)}
                    className="mt-1 text-primary hover:text-primary-hover text-xs underline"
                  >
                    Copy to clipboard
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={handleDismiss}
              className="mt-3 text-xs text-foreground-muted hover:text-foreground underline"
            >
              Dismiss
            </button>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-foreground-muted hover:text-foreground"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <ToastProvider>
      <SocketToastListener />
      <NavigationGuardProvider />
      <MessageRecoveryProvider />
      <div className="h-screen flex flex-col bg-background overflow-hidden pt-[env(safe-area-inset-top)]">
        {/* Page content */}
        <main className="flex-1 overflow-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
          {children}
        </main>

        {/* Bottom navigation */}
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
