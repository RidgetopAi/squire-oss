import { Router, Request, Response } from 'express';
import {
  createReminder,
  createStandaloneReminder,
  createScheduledReminder,
  getReminder,
  listReminders,
  updateReminder,
  deleteReminder,
  cancelReminder,
  snoozeReminder,
  markReminderAcknowledged,
  getCommitmentReminders,
  getReminderStats,
  ReminderStatus,
  ReminderChannel,
} from '../../services/reminders.js';

const router = Router();

/**
 * GET /api/reminders
 * List reminders with optional filters
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as ReminderStatus | ReminderStatus[] | undefined;
    const commitment_id = req.query.commitment_id as string | undefined;
    const channel = req.query.channel as ReminderChannel | undefined;
    const scheduled_before = req.query.scheduled_before ? new Date(req.query.scheduled_before as string) : undefined;
    const scheduled_after = req.query.scheduled_after ? new Date(req.query.scheduled_after as string) : undefined;

    const reminders = await listReminders({
      limit,
      offset,
      status,
      commitment_id,
      channel,
      scheduled_before,
      scheduled_after,
    });

    res.json({
      reminders,
      count: reminders.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing reminders:', error);
    res.status(500).json({ error: 'Failed to list reminders' });
  }
});

/**
 * GET /api/reminders/stats
 * Get reminder statistics
 */
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getReminderStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting reminder stats:', error);
    res.status(500).json({ error: 'Failed to get reminder stats' });
  }
});

/**
 * GET /api/reminders/commitment/:commitmentId
 * Get all reminders for a specific commitment
 */
router.get('/commitment/:commitmentId', async (req: Request, res: Response): Promise<void> => {
  try {
    const commitmentId = req.params.commitmentId as string;
    const status = req.query.status as ReminderStatus | ReminderStatus[] | undefined;

    const reminders = await getCommitmentReminders(commitmentId, { status });
    res.json({ reminders, count: reminders.length });
  } catch (error) {
    console.error('Error getting commitment reminders:', error);
    res.status(500).json({ error: 'Failed to get commitment reminders' });
  }
});

/**
 * POST /api/reminders
 * Create a new reminder (standalone or commitment-linked)
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      commitment_id,
      title,
      body,
      scheduled_for,
      timezone,
      offset_type,
      offset_minutes,
      channel,
      metadata,
    } = req.body;

    if (!scheduled_for) {
      res.status(400).json({ error: 'scheduled_for is required' });
      return;
    }

    if (!commitment_id && !title) {
      res.status(400).json({ error: 'Either commitment_id or title is required' });
      return;
    }

    const reminder = await createReminder({
      commitment_id,
      title,
      body,
      scheduled_for: new Date(scheduled_for),
      timezone,
      offset_type,
      offset_minutes,
      channel,
      metadata,
    });

    res.status(201).json(reminder);
  } catch (error) {
    console.error('Error creating reminder:', error);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

/**
 * POST /api/reminders/standalone
 * Create a standalone reminder with delay or specific time
 * Accepts either delay_minutes (relative) or scheduled_at (ISO date string)
 */
router.post('/standalone', async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, delay_minutes, scheduled_at, body, timezone } = req.body;

    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    // Must provide either delay_minutes or scheduled_at
    if (!delay_minutes && !scheduled_at) {
      res.status(400).json({ error: 'Either delay_minutes or scheduled_at is required' });
      return;
    }

    let reminder;
    if (scheduled_at) {
      // Absolute time scheduling
      const scheduledDate = new Date(scheduled_at);
      if (isNaN(scheduledDate.getTime())) {
        res.status(400).json({ error: 'scheduled_at must be a valid ISO date string' });
        return;
      }
      if (scheduledDate <= new Date()) {
        res.status(400).json({ error: 'scheduled_at must be in the future' });
        return;
      }
      reminder = await createScheduledReminder(title, scheduledDate, { body, timezone });
    } else {
      // Relative time scheduling
      if (typeof delay_minutes !== 'number' || delay_minutes <= 0) {
        res.status(400).json({ error: 'delay_minutes must be a positive number' });
        return;
      }
      reminder = await createStandaloneReminder(title, delay_minutes, { body, timezone });
    }

    res.status(201).json(reminder);
  } catch (error) {
    console.error('Error creating standalone reminder:', error);
    res.status(500).json({ error: 'Failed to create standalone reminder' });
  }
});

/**
 * GET /api/reminders/:id
 * Get a single reminder by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const reminder = await getReminder(id);

    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    res.json(reminder);
  } catch (error) {
    console.error('Error getting reminder:', error);
    res.status(500).json({ error: 'Failed to get reminder' });
  }
});

/**
 * PATCH /api/reminders/:id
 * Update a reminder
 */
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { title, body, scheduled_for, timezone, channel, status, metadata } = req.body;

    const reminder = await updateReminder(id, {
      title,
      body,
      scheduled_for: scheduled_for ? new Date(scheduled_for) : undefined,
      timezone,
      channel,
      status,
      metadata,
    });

    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    res.json(reminder);
  } catch (error) {
    console.error('Error updating reminder:', error);
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

/**
 * DELETE /api/reminders/:id
 * Delete a reminder
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const deleted = await deleteReminder(id);

    if (!deleted) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting reminder:', error);
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

/**
 * POST /api/reminders/:id/cancel
 * Cancel a reminder (soft delete - sets status to canceled)
 */
router.post('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const reminder = await cancelReminder(id);

    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    res.json(reminder);
  } catch (error) {
    console.error('Error canceling reminder:', error);
    res.status(500).json({ error: 'Failed to cancel reminder' });
  }
});

/**
 * POST /api/reminders/:id/snooze
 * Snooze a reminder
 */
router.post('/:id/snooze', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { snooze_until, snooze_minutes } = req.body;

    let snoozeTime: Date;
    if (snooze_until) {
      snoozeTime = new Date(snooze_until);
    } else if (snooze_minutes && typeof snooze_minutes === 'number') {
      snoozeTime = new Date(Date.now() + snooze_minutes * 60000);
    } else {
      // Default: snooze for 1 hour
      snoozeTime = new Date(Date.now() + 60 * 60000);
    }

    const reminder = await snoozeReminder(id, { snooze_until: snoozeTime });

    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    res.json(reminder);
  } catch (error) {
    console.error('Error snoozing reminder:', error);
    res.status(500).json({ error: 'Failed to snooze reminder' });
  }
});

/**
 * POST /api/reminders/:id/acknowledge
 * Acknowledge a reminder (user saw/acted on it)
 */
router.post('/:id/acknowledge', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const reminder = await markReminderAcknowledged(id);

    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    res.json(reminder);
  } catch (error) {
    console.error('Error acknowledging reminder:', error);
    res.status(500).json({ error: 'Failed to acknowledge reminder' });
  }
});

export default router;
