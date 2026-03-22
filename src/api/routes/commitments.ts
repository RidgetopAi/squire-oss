import { Router, Request, Response } from 'express';
import {
  createCommitment,
  getCommitment,
  listCommitments,
  listCommitmentsExpanded,
  updateCommitment,
  deleteCommitment,
  resolveCommitment,
  snoozeCommitment,
  unsnoozeCommitment,
  countCommitmentsByStatus,
  getOverdueCommitments,
  getUpcomingCommitments,
  findMatchingCommitments,
  getNextCommitmentOccurrence,
  parseOccurrenceId,
  CommitmentStatus,
} from '../../services/commitments.js';

const router = Router();

/**
 * GET /api/commitments
 * List commitments with optional filters
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as CommitmentStatus | CommitmentStatus[] | undefined;
    const include_resolved = req.query.include_resolved === 'true';
    const due_before = req.query.due_before ? new Date(req.query.due_before as string) : undefined;
    const due_after = req.query.due_after ? new Date(req.query.due_after as string) : undefined;

    const commitments = await listCommitments({
      limit,
      offset,
      status,
      include_resolved,
      due_before,
      due_after,
    });

    res.json({
      commitments,
      count: commitments.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing commitments:', error);
    res.status(500).json({ error: 'Failed to list commitments' });
  }
});

/**
 * GET /api/commitments/expanded
 * List commitments with recurring ones expanded into individual occurrences
 */
router.get('/expanded', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as CommitmentStatus | CommitmentStatus[] | undefined;
    const include_resolved = req.query.include_resolved === 'true';
    const expand_recurring = req.query.expand !== 'false'; // Default to true
    const max_occurrences = parseInt(req.query.max_occurrences as string) || 50;
    const due_before = req.query.due_before ? new Date(req.query.due_before as string) : undefined;
    const due_after = req.query.due_after ? new Date(req.query.due_after as string) : undefined;

    const commitments = await listCommitmentsExpanded({
      limit,
      offset,
      status,
      include_resolved,
      expand_recurring,
      max_occurrences,
      due_before,
      due_after,
    });

    res.json({
      commitments,
      count: commitments.length,
      expanded: expand_recurring,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing expanded commitments:', error);
    res.status(500).json({ error: 'Failed to list expanded commitments' });
  }
});

/**
 * GET /api/commitments/:id/next-occurrence
 * Get the next occurrence of a recurring commitment
 */
router.get('/:id/next-occurrence', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const after = req.query.after ? new Date(req.query.after as string) : new Date();

    // Handle occurrence IDs
    const { commitmentId } = parseOccurrenceId(id);
    const nextOccurrence = await getNextCommitmentOccurrence(commitmentId, after);

    if (!nextOccurrence) {
      res.json({ next_occurrence: null, is_recurring: false });
      return;
    }

    res.json({
      next_occurrence: nextOccurrence.toISOString(),
      is_recurring: true,
    });
  } catch (error) {
    console.error('Error getting next occurrence:', error);
    res.status(500).json({ error: 'Failed to get next occurrence' });
  }
});

/**
 * GET /api/commitments/stats
 * Get commitment counts by status
 */
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const counts = await countCommitmentsByStatus();
    res.json(counts);
  } catch (error) {
    console.error('Error getting commitment stats:', error);
    res.status(500).json({ error: 'Failed to get commitment stats' });
  }
});

/**
 * GET /api/commitments/overdue
 * Get overdue commitments
 */
router.get('/overdue', async (_req: Request, res: Response): Promise<void> => {
  try {
    const commitments = await getOverdueCommitments();
    res.json({ commitments, count: commitments.length });
  } catch (error) {
    console.error('Error getting overdue commitments:', error);
    res.status(500).json({ error: 'Failed to get overdue commitments' });
  }
});

/**
 * GET /api/commitments/upcoming
 * Get commitments due within a time window
 */
router.get('/upcoming', async (req: Request, res: Response): Promise<void> => {
  try {
    const withinMinutes = parseInt(req.query.within_minutes as string) || 60;
    const commitments = await getUpcomingCommitments(withinMinutes);
    res.json({ commitments, count: commitments.length, within_minutes: withinMinutes });
  } catch (error) {
    console.error('Error getting upcoming commitments:', error);
    res.status(500).json({ error: 'Failed to get upcoming commitments' });
  }
});

/**
 * GET /api/commitments/search
 * Search commitments by text similarity (for resolution matching)
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.query as string;
    if (!query) {
      res.status(400).json({ error: 'query parameter is required' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 5;
    const minSimilarity = parseFloat(req.query.min_similarity as string) || 0.5;

    const commitments = await findMatchingCommitments(query, { limit, minSimilarity });
    res.json({ query, commitments, count: commitments.length });
  } catch (error) {
    console.error('Error searching commitments:', error);
    res.status(500).json({ error: 'Failed to search commitments' });
  }
});

/**
 * POST /api/commitments
 * Create a new commitment
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      description,
      memory_id,
      source_type,
      due_at,
      timezone,
      all_day,
      duration_minutes,
      rrule,
      recurrence_end_at,
      tags,
      metadata,
    } = req.body;

    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'title is required and must be a string' });
      return;
    }

    const commitment = await createCommitment({
      title,
      description,
      memory_id,
      source_type,
      due_at: due_at ? new Date(due_at) : undefined,
      timezone,
      all_day,
      duration_minutes,
      rrule,
      recurrence_end_at: recurrence_end_at ? new Date(recurrence_end_at) : undefined,
      tags,
      metadata,
    });

    res.status(201).json(commitment);
  } catch (error) {
    console.error('Error creating commitment:', error);
    res.status(500).json({ error: 'Failed to create commitment' });
  }
});

/**
 * GET /api/commitments/:id
 * Get a single commitment by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const commitment = await getCommitment(id);

    if (!commitment) {
      res.status(404).json({ error: 'Commitment not found' });
      return;
    }

    res.json(commitment);
  } catch (error) {
    console.error('Error getting commitment:', error);
    res.status(500).json({ error: 'Failed to get commitment' });
  }
});

/**
 * PATCH /api/commitments/:id
 * Update a commitment
 */
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const {
      title,
      description,
      due_at,
      timezone,
      all_day,
      duration_minutes,
      rrule,
      recurrence_end_at,
      status,
      tags,
      metadata,
      google_sync_status,
    } = req.body;

    const commitment = await updateCommitment(id, {
      title,
      description,
      due_at: due_at === null ? null : (due_at ? new Date(due_at) : undefined),
      timezone,
      all_day,
      duration_minutes,
      rrule,
      recurrence_end_at: recurrence_end_at === null ? null : (recurrence_end_at ? new Date(recurrence_end_at) : undefined),
      status,
      tags,
      metadata,
      google_sync_status,
    });

    if (!commitment) {
      res.status(404).json({ error: 'Commitment not found' });
      return;
    }

    res.json(commitment);
  } catch (error) {
    console.error('Error updating commitment:', error);
    res.status(500).json({ error: 'Failed to update commitment' });
  }
});

/**
 * DELETE /api/commitments/:id
 * Delete a commitment
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const deleted = await deleteCommitment(id);

    if (!deleted) {
      res.status(404).json({ error: 'Commitment not found' });
      return;
    }

    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting commitment:', error);
    res.status(500).json({ error: 'Failed to delete commitment' });
  }
});

/**
 * POST /api/commitments/:id/resolve
 * Mark a commitment as resolved (completed, canceled, etc.)
 */
router.post('/:id/resolve', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { resolution_type, resolution_memory_id } = req.body;

    if (!resolution_type) {
      res.status(400).json({ error: 'resolution_type is required' });
      return;
    }

    const validTypes = ['completed', 'canceled', 'no_longer_relevant', 'superseded'];
    if (!validTypes.includes(resolution_type)) {
      res.status(400).json({
        error: `resolution_type must be one of: ${validTypes.join(', ')}`,
      });
      return;
    }

    const commitment = await resolveCommitment(id, {
      resolution_type,
      resolution_memory_id,
    });

    if (!commitment) {
      res.status(404).json({ error: 'Commitment not found' });
      return;
    }

    res.json(commitment);
  } catch (error) {
    console.error('Error resolving commitment:', error);
    res.status(500).json({ error: 'Failed to resolve commitment' });
  }
});

/**
 * POST /api/commitments/:id/snooze
 * Snooze a commitment to a later time
 */
router.post('/:id/snooze', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { snooze_until } = req.body;

    if (!snooze_until) {
      res.status(400).json({ error: 'snooze_until is required' });
      return;
    }

    const commitment = await snoozeCommitment(id, {
      snooze_until: new Date(snooze_until),
    });

    if (!commitment) {
      res.status(404).json({ error: 'Commitment not found' });
      return;
    }

    res.json(commitment);
  } catch (error) {
    console.error('Error snoozing commitment:', error);
    res.status(500).json({ error: 'Failed to snooze commitment' });
  }
});

/**
 * POST /api/commitments/:id/unsnooze
 * Unsnooze a commitment (return to open status)
 */
router.post('/:id/unsnooze', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const commitment = await unsnoozeCommitment(id);

    if (!commitment) {
      res.status(404).json({ error: 'Commitment not found or not snoozed' });
      return;
    }

    res.json(commitment);
  } catch (error) {
    console.error('Error unsnoozing commitment:', error);
    res.status(500).json({ error: 'Failed to unsnooze commitment' });
  }
});

export default router;
