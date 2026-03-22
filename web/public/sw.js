// Squire Service Worker for Push Notifications
// Version: 2.0.0

const CACHE_NAME = 'squire-v2';

// ========================================
// Installation
// ========================================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  // Skip waiting to activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated');
  // Take control of all pages immediately
  event.waitUntil(self.clients.claim());
});

// ========================================
// Push Notifications
// ========================================

self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  if (!event.data) {
    console.warn('[SW] Push event has no data');
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    console.error('[SW] Failed to parse push data:', e);
    payload = {
      title: 'Squire',
      body: event.data.text(),
    };
  }

  const {
    title = 'Squire',
    body = '',
    icon = '/icon-192.png',
    badge = '/badge-72.png',
    tag,
    data = {},
    actions = [],
  } = payload;

  const options = {
    body,
    icon,
    badge,
    tag,
    data,
    actions,
    // Require interaction for reminder notifications
    requireInteraction: data.type === 'reminder',
    // Vibration pattern for mobile
    vibrate: [200, 100, 200],
    // Renotify even if same tag
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ========================================
// Notification Click Handling
// ========================================

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action, event.notification.data);

  const notification = event.notification;
  const data = notification.data || {};
  const action = event.action;

  // Close the notification
  notification.close();

  // Handle different actions
  if (action === 'snooze' && data.reminder_id) {
    // Snooze the reminder for 1 hour
    event.waitUntil(handleSnooze(data.reminder_id));
  } else if (action === 'done' && data.reminder_id) {
    // Mark the reminder as acknowledged
    event.waitUntil(handleDone(data.reminder_id));
  } else {
    // Default action: open the app
    const url = data.url || '/app';
    event.waitUntil(openOrFocusWindow(url));
  }
});

self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
  // Could track dismissals here if needed
});

// ========================================
// Action Handlers
// ========================================

async function handleSnooze(reminderId) {
  try {
    const response = await fetch(`/api/reminders/${reminderId}/snooze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ snooze_minutes: 60 }), // Snooze for 1 hour
    });

    if (!response.ok) {
      console.error('[SW] Failed to snooze reminder:', response.status);
    } else {
      console.log('[SW] Reminder snoozed successfully');
      // Show confirmation notification
      await self.registration.showNotification('Snoozed', {
        body: 'Reminder snoozed for 1 hour',
        icon: '/icon-192.png',
        tag: 'snooze-confirm',
        requireInteraction: false,
      });
    }
  } catch (error) {
    console.error('[SW] Error snoozing reminder:', error);
  }
}

async function handleDone(reminderId) {
  try {
    const response = await fetch(`/api/reminders/${reminderId}/acknowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[SW] Failed to acknowledge reminder:', response.status);
    } else {
      console.log('[SW] Reminder acknowledged successfully');
    }
  } catch (error) {
    console.error('[SW] Error acknowledging reminder:', error);
  }
}

async function openOrFocusWindow(url) {
  // Get all windows/tabs controlled by this service worker
  const windowClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  // Try to find an existing window with the same origin
  for (const client of windowClients) {
    if (client.url.startsWith(self.location.origin)) {
      // Focus the existing window and navigate to the URL
      await client.focus();
      if (client.url !== new URL(url, self.location.origin).href) {
        await client.navigate(url);
      }
      return;
    }
  }

  // No existing window found, open a new one
  await self.clients.openWindow(url);
}

// ========================================
// Message Handling (for future use)
// ========================================

self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ========================================
// Background Sync (for future use)
// ========================================

self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  // Could implement offline action queuing here
});
