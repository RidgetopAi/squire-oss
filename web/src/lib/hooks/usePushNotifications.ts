import { useState, useEffect, useCallback } from 'react';

// ========================================
// Types
// ========================================

export interface PushNotificationState {
  /** Whether push notifications are supported by the browser */
  isSupported: boolean;
  /** Whether the service worker is registered */
  isRegistered: boolean;
  /** Whether we have permission to send notifications */
  permission: NotificationPermission;
  /** Whether we're currently subscribed to push */
  isSubscribed: boolean;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Any error that occurred */
  error: string | null;
}

export interface UsePushNotificationsReturn extends PushNotificationState {
  /** Request notification permission from the user */
  requestPermission: () => Promise<NotificationPermission>;
  /** Subscribe to push notifications */
  subscribe: () => Promise<boolean>;
  /** Unsubscribe from push notifications */
  unsubscribe: () => Promise<boolean>;
  /** Get the current subscription (if any) */
  getSubscription: () => Promise<PushSubscription | null>;
}

// ========================================
// API Helpers
// ========================================

const API_BASE = '/api/notifications';

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/vapid-key`);
    if (!response.ok) {
      console.error('Failed to get VAPID key:', response.status);
      return null;
    }
    const data = await response.json();
    return data.publicKey;
  } catch (error) {
    console.error('Error fetching VAPID key:', error);
    return null;
  }
}

async function sendSubscriptionToServer(subscription: PushSubscription): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
        auth: arrayBufferToBase64(subscription.getKey('auth')),
        user_agent: navigator.userAgent,
        device_name: getDeviceName(),
      }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error sending subscription to server:', error);
    return false;
  }
}

async function removeSubscriptionFromServer(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/unsubscribe`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ endpoint }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error removing subscription from server:', error);
    return false;
  }
}

// ========================================
// Utility Functions
// ========================================

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown Device';
}

// ========================================
// Hook Implementation
// ========================================

export function usePushNotifications(): UsePushNotificationsReturn {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isRegistered: false,
    permission: 'default',
    isSubscribed: false,
    isLoading: true,
    error: null,
  });

  // Check initial state on mount
  useEffect(() => {
    async function checkState() {
      // Check if push is supported
      const isSupported = 'serviceWorker' in navigator && 'PushManager' in window;

      if (!isSupported) {
        setState({
          isSupported: false,
          isRegistered: false,
          permission: 'denied',
          isSubscribed: false,
          isLoading: false,
          error: 'Push notifications are not supported in this browser',
        });
        return;
      }

      // Check permission
      const permission = Notification.permission;

      // Check if service worker is registered
      let registration: ServiceWorkerRegistration | undefined;
      try {
        registration = await navigator.serviceWorker.getRegistration();
      } catch (e) {
        console.error('Error getting service worker registration:', e);
      }

      // Check if subscribed
      let isSubscribed = false;
      if (registration) {
        try {
          const subscription = await registration.pushManager.getSubscription();
          isSubscribed = subscription !== null;
        } catch (e) {
          console.error('Error checking push subscription:', e);
        }
      }

      setState({
        isSupported: true,
        isRegistered: registration !== undefined,
        permission,
        isSubscribed,
        isLoading: false,
        error: null,
      });
    }

    checkState();
  }, []);

  // Register service worker if not already registered
  useEffect(() => {
    if (!state.isSupported || state.isRegistered || state.isLoading) return;

    async function registerServiceWorker() {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service worker registered:', registration.scope);
        setState((prev) => ({ ...prev, isRegistered: true }));
      } catch (error) {
        console.error('Service worker registration failed:', error);
        setState((prev) => ({
          ...prev,
          error: 'Failed to register service worker',
        }));
      }
    }

    registerServiceWorker();
  }, [state.isSupported, state.isRegistered, state.isLoading]);

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!state.isSupported) {
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      setState((prev) => ({ ...prev, permission }));
      return permission;
    } catch (error) {
      console.error('Error requesting permission:', error);
      setState((prev) => ({ ...prev, error: 'Failed to request permission' }));
      return 'denied';
    }
  }, [state.isSupported]);

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported || !state.isRegistered) {
      setState((prev) => ({ ...prev, error: 'Service worker not ready' }));
      return false;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Ensure we have permission
      if (state.permission !== 'granted') {
        const permission = await requestPermission();
        if (permission !== 'granted') {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: 'Notification permission denied',
          }));
          return false;
        }
      }

      // Get VAPID public key from server
      const vapidPublicKey = await getVapidPublicKey();
      if (!vapidPublicKey) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Push notifications not configured on server',
        }));
        return false;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // Send subscription to server
      const success = await sendSubscriptionToServer(subscription);
      if (!success) {
        // Unsubscribe locally if server registration failed
        await subscription.unsubscribe();
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Failed to register subscription with server',
        }));
        return false;
      }

      setState((prev) => ({
        ...prev,
        isSubscribed: true,
        isLoading: false,
        error: null,
      }));
      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to subscribe',
      }));
      return false;
    }
  }, [state.isSupported, state.isRegistered, state.permission, requestPermission]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      return false;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Remove from server first
        await removeSubscriptionFromServer(subscription.endpoint);
        // Then unsubscribe locally
        await subscription.unsubscribe();
      }

      setState((prev) => ({
        ...prev,
        isSubscribed: false,
        isLoading: false,
        error: null,
      }));
      return true;
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to unsubscribe',
      }));
      return false;
    }
  }, [state.isSupported]);

  // Get current subscription
  const getSubscription = useCallback(async (): Promise<PushSubscription | null> => {
    if (!state.isSupported) {
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      return await registration.pushManager.getSubscription();
    } catch (error) {
      console.error('Error getting subscription:', error);
      return null;
    }
  }, [state.isSupported]);

  return {
    ...state,
    requestPermission,
    subscribe,
    unsubscribe,
    getSubscription,
  };
}
