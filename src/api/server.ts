import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from '../config/index.js';
import { registerSocketHandlers, setSocketServer } from './socket/index.js';
import memoriesRouter from './routes/memories.js';
import healthRouter from './routes/health.js';
import contextRouter from './routes/context.js';
import entitiesRouter from './routes/entities.js';
import consolidationRouter from './routes/consolidation.js';
import summariesRouter from './routes/summaries.js';
import beliefsRouter from './routes/beliefs.js';
import patternsRouter from './routes/patterns.js';
import insightsRouter from './routes/insights.js';
import researchRouter from './routes/research.js';
import graphRouter from './routes/graph.js';
import objectsRouter from './routes/objects.js';
import chatRouter from './routes/chat.js';
import commitmentsRouter from './routes/commitments.js';
import remindersRouter from './routes/reminders.js';
import notificationsRouter from './routes/notifications.js';
import googleRouter from './routes/google.js';
import calendarRouter from './routes/calendar.js';
import notesRouter from './routes/notes.js';
import listsRouter from './routes/lists.js';
import identityRouter from './routes/identity.js';
import documentsRouter from './routes/documents.js';
import toolsRouter from './routes/tools.js';
import savedCardsRouter from './routes/saved-cards.js';
import { initScheduler, shutdownScheduler } from '../services/scheduler.js';
import { migrateFromPersonalitySummary } from '../services/identity.js';
import { syncAllAccounts } from '../services/google/sync.js';
import { isGoogleConfigured } from '../services/google/auth.js';
import { startTelegramPoller, stopTelegramPoller } from '../services/telegram/index.js';
import { startCourier, stopCourier } from '../services/courier/index.js';
import { initCommuneScheduler, shutdownCommuneScheduler } from '../services/commune/index.js';

// Google Calendar sync interval (configurable, default 15 minutes)
const CALENDAR_SYNC_INTERVAL_MS = parseInt(process.env['CALENDAR_SYNC_INTERVAL_MS'] || '900000', 10);
let calendarSyncTimer: NodeJS.Timeout | null = null;

const app = express();
const httpServer = createServer(app);

// Socket.IO setup with CORS for Next.js dev server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.server.corsOrigin || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB for image uploads
  // Generous timeouts to prevent disconnects during long LLM streams
  // Mobile browsers throttle JS during streaming, causing delayed pong responses
  pingTimeout: 60000,    // 60s (default 20s) — time to wait for pong
  pingInterval: 30000,   // 30s (default 25s) — interval between pings
});

// Register Socket.IO event handlers
registerSocketHandlers(io);

// Register io for broadcast functions (used by services)
setSocketServer(io);

// Middleware
app.use(express.json({ limit: '5mb' }));

// Routes
app.use('/api/health', healthRouter);
app.use('/api/memories', memoriesRouter);
app.use('/api/context', contextRouter);
app.use('/api/entities', entitiesRouter);
app.use('/api/consolidation', consolidationRouter);
app.use('/api/summaries', summariesRouter);
app.use('/api/beliefs', beliefsRouter);
app.use('/api/patterns', patternsRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/research', researchRouter);
app.use('/api/graph', graphRouter);
app.use('/api/objects', objectsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/commitments', commitmentsRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/integrations/google', googleRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/notes', notesRouter);
app.use('/api/lists', listsRouter);
app.use('/api/identity', identityRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/tools', toolsRouter);
app.use('/api/saved-cards', savedCardsRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = config.server.port;

httpServer.listen(port, async () => {
  console.log(`Squire API server running on http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/api/health`);
  console.log(`Socket.IO enabled for real-time events`);

  // Migrate user identity from personality summary if not already set
  try {
    const identity = await migrateFromPersonalitySummary();
    if (identity) {
      console.log(`User identity locked: ${identity.name}`);
    }
  } catch (error) {
    console.error('Identity migration failed:', error);
  }

  // Start the reminder scheduler
  initScheduler();
  console.log(`Reminder scheduler started`);

  // Start Google Calendar sync scheduler (only if configured)
  if (isGoogleConfigured()) {
    const runCalendarSync = async () => {
      try {
        console.log('[CalendarSync] Starting sync...');
        const results = await syncAllAccounts();
        const accountCount = results.size;
        let totalEvents = 0;
        results.forEach((r) => { totalEvents += r.events.pulled; });
        console.log(`[CalendarSync] Synced ${accountCount} account(s), ${totalEvents} events pulled`);
      } catch (error) {
        console.error('[CalendarSync] Sync failed:', error);
      }
    };

    // Run initial sync after short delay (let server fully start)
    setTimeout(runCalendarSync, 5000);

    // Schedule periodic syncs
    calendarSyncTimer = setInterval(runCalendarSync, CALENDAR_SYNC_INTERVAL_MS);
    console.log(`Google Calendar sync scheduler started (every ${CALENDAR_SYNC_INTERVAL_MS / 60000} minutes)`);
  } else {
    console.log('[Server] Google Calendar not configured, skipping sync');
  }

  // Start Telegram bot poller (if configured)
  try {
    const telegramStarted = await startTelegramPoller();
    if (telegramStarted) {
      console.log('Telegram bot poller started');
    }
  } catch (error) {
    console.error('Failed to start Telegram poller:', error);
  }

  // Start Courier scheduler
  if (config.courier.enabled) {
    startCourier();
    console.log('[Server] Courier scheduler started');
  }

  // Start Commune scheduler (proactive outreach)
  if (config.commune.enabled) {
    initCommuneScheduler();
    console.log('[Server] Commune scheduler started');
  }
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down gracefully...');
  shutdownScheduler();
  stopTelegramPoller();
  stopCourier();
  shutdownCommuneScheduler();
  if (calendarSyncTimer) {
    clearInterval(calendarSyncTimer);
    calendarSyncTimer = null;
  }
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
