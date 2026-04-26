import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { registerSocketHandlers, setSocketServer } from './socket/index.js';
import { apiKeyAuth, verifyApiKey } from './middleware/auth.js';
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
import { startTelegramPoller, stopTelegramPoller } from '../services/telegram/index.js';
import { startCourier, stopCourier } from '../services/courier/index.js';
import { initCommuneScheduler, shutdownCommuneScheduler } from '../services/commune/index.js';
import { closePool } from '../db/pool.js';

// Google Calendar sync interval (configurable, default 15 minutes)
const CALENDAR_SYNC_INTERVAL_MS = parseInt(process.env['CALENDAR_SYNC_INTERVAL_MS'] || '900000', 10);
let calendarSyncTimer: NodeJS.Timeout | null = null;

// === Production safety checks ===
// In production, refuse to start without an API key or with a localhost CORS
// origin. Both are footguns: missing apiKey leaves every endpoint open;
// localhost CORS in production usually means the operator forgot to set the
// real frontend origin.
if (process.env.NODE_ENV === 'production') {
  if (!config.security.apiKey) {
    throw new Error(
      'Refusing to start: SQUIRE_API_KEY is required in production. ' +
      'Generate one with `openssl rand -hex 32` and set it in your .env.'
    );
  }
  if (!config.server.corsOrigin || config.server.corsOrigin.includes('localhost')) {
    throw new Error(
      'Refusing to start: CORS_ORIGIN must be set to your frontend origin ' +
      'in production (not localhost). Example: CORS_ORIGIN=https://app.example.com'
    );
  }
}

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

// Socket.IO authentication. Mirrors the REST apiKeyAuth: if SQUIRE_API_KEY
// is set, every connecting socket must present it via either
//   handshake.auth = { token: '<key>' }
// or
//   handshake.headers['x-api-key'] = '<key>'
// In dev mode (no key configured), connections are accepted unconditionally.
io.use((socket, next) => {
  const auth = socket.handshake.auth as { token?: unknown; apiKey?: unknown } | undefined;
  const headerKey = socket.handshake.headers['x-api-key'];
  const candidate = (auth?.token ?? auth?.apiKey ?? headerKey) as unknown;
  if (verifyApiKey(candidate)) {
    next();
  } else {
    next(new Error('unauthorized'));
  }
});

// Register Socket.IO event handlers
registerSocketHandlers(io);

// Register io for broadcast functions (used by services)
setSocketServer(io);

// Security middleware
app.use(helmet({
  // Disable CSP for API-only server (frontend handles CSP)
  contentSecurityPolicy: false,
}));

// General rate limiter (100 req / 15 min per IP)
const generalLimiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Stricter rate limiter for chat endpoint (20 req / min per IP)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.security.chatRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests, please try again later' },
});

// Apply general rate limit to all API routes
app.use('/api', generalLimiter);

// Middleware. Tight JSON body cap — large file uploads go through
// the multer-backed routes (e.g. /api/objects, /api/documents) which
// have their own size limits and streaming. 1MB is plenty for normal
// API requests and shrinks the rate-limit×size DoS amplifier.
app.use(express.json({ limit: '1mb' }));

// Health check - no auth required (for monitoring)
app.use('/api/health', healthRouter);

// API key authentication for all other routes
app.use('/api', apiKeyAuth);

// Chat route with stricter rate limit
app.use('/api/chat', chatLimiter, chatRouter);

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
// Note: /api/chat is registered above with stricter rate limit
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

  // Start Google Calendar sync scheduler
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

// Graceful shutdown — drain in-flight requests, close DB pool, then exit
let shutdownInProgress = false;
const shutdown = async () => {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  console.log('[Shutdown] Starting graceful shutdown...');

  // 1. Stop accepting new work
  shutdownScheduler();
  stopTelegramPoller();
  stopCourier();
  shutdownCommuneScheduler();
  if (calendarSyncTimer) {
    clearInterval(calendarSyncTimer);
    calendarSyncTimer = null;
  }

  // 2. Close Socket.IO (stops new connections, lets in-flight finish)
  io.close();
  console.log('[Shutdown] Socket.IO closed');

  // 3. Close HTTP server (stops new requests, waits for in-flight)
  await new Promise<void>((resolve) => {
    httpServer.close(() => {
      console.log('[Shutdown] HTTP server closed');
      resolve();
    });
    // If it takes too long, proceed anyway
    setTimeout(resolve, 5000);
  });

  // 4. Drain database pool (waits for in-flight queries to finish)
  try {
    await closePool();
    console.log('[Shutdown] Database pool closed');
  } catch (err) {
    console.error('[Shutdown] Error closing database pool:', err);
  }

  console.log('[Shutdown] Clean exit');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
