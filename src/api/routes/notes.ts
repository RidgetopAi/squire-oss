import { Router, Request, Response } from 'express';

interface IdParams { id: string }
interface EntityParams { entityId: string }
import {
  createNote,
  getNote,
  updateNote,
  archiveNote,
  deleteNote,
  listNotes,
  searchNotes,
  getNotesByEntity,
  getPinnedNotes,
  linkNoteToEntity,
  unlinkNoteFromEntity,
  pinNote,
  unpinNote,
  exportNotes,
  NoteSourceType,
} from '../../services/notes.js';

const router = Router();

/**
 * GET /api/notes
 * List notes with optional filters
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const category = req.query.category as string | undefined;
    const entity_id = req.query.entity_id as string | undefined;
    const is_pinned = req.query.is_pinned === 'true' ? true : req.query.is_pinned === 'false' ? false : undefined;
    const include_archived = req.query.include_archived === 'true';
    const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined;

    const notes = await listNotes({
      limit,
      offset,
      category,
      entity_id,
      is_pinned,
      include_archived,
      tags,
    });

    res.json({
      notes,
      count: notes.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing notes:', error);
    res.status(500).json({ error: 'Failed to list notes' });
  }
});

/**
 * GET /api/notes/search
 * Search notes semantically
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: 'Query parameter q is required' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const threshold = parseFloat(req.query.threshold as string) || 0.3;
    const entity_id = req.query.entity_id as string | undefined;
    const category = req.query.category as string | undefined;

    const notes = await searchNotes(query, { limit, threshold, entity_id, category });

    res.json({
      notes,
      count: notes.length,
      query,
    });
  } catch (error) {
    console.error('Error searching notes:', error);
    res.status(500).json({ error: 'Failed to search notes' });
  }
});

/**
 * GET /api/notes/pinned
 * Get all pinned notes
 */
router.get('/pinned', async (_req: Request, res: Response): Promise<void> => {
  try {
    const notes = await getPinnedNotes();
    res.json({ notes, count: notes.length });
  } catch (error) {
    console.error('Error getting pinned notes:', error);
    res.status(500).json({ error: 'Failed to get pinned notes' });
  }
});

/**
 * GET /api/notes/export
 * Export notes in various formats
 */
router.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const format = (req.query.format as 'json' | 'markdown' | 'csv') || 'json';
    const entity_id = req.query.entity_id as string | undefined;
    const category = req.query.category as string | undefined;
    const include_archived = req.query.include_archived === 'true';
    const include_metadata = req.query.include_metadata === 'true';

    const result = await exportNotes({
      format,
      entity_id,
      category,
      include_archived,
      include_metadata,
    });

    const contentTypes: Record<string, string> = {
      json: 'application/json',
      markdown: 'text/markdown',
      csv: 'text/csv',
    };

    res.setHeader('Content-Type', contentTypes[format] || 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="notes-export.${format === 'markdown' ? 'md' : format}"`);
    res.send(result.data);
  } catch (error) {
    console.error('Error exporting notes:', error);
    res.status(500).json({ error: 'Failed to export notes' });
  }
});

/**
 * GET /api/notes/entity/:entityId
 * Get all notes for a specific entity
 */
router.get('/entity/:entityId', async (req: Request<EntityParams>, res: Response): Promise<void> => {
  try {
    const entityId = req.params.entityId;
    const notes = await getNotesByEntity(entityId);
    res.json({ notes, count: notes.length });
  } catch (error) {
    console.error('Error getting entity notes:', error);
    res.status(500).json({ error: 'Failed to get entity notes' });
  }
});

/**
 * POST /api/notes
 * Create a new note
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      content,
      source_type,
      source_context,
      primary_entity_id,
      entity_ids,
      category,
      tags,
      is_pinned,
      color,
      create_memory,
    } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const validSourceTypes: NoteSourceType[] = ['manual', 'voice', 'chat', 'calendar_event'];
    if (source_type && !validSourceTypes.includes(source_type)) {
      res.status(400).json({ error: `Invalid source_type. Must be one of: ${validSourceTypes.join(', ')}` });
      return;
    }

    const note = await createNote({
      title,
      content,
      source_type,
      source_context,
      primary_entity_id,
      entity_ids,
      category,
      tags,
      is_pinned,
      color,
      create_memory,
    });

    res.status(201).json(note);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

/**
 * GET /api/notes/:id
 * Get a single note by ID
 */
router.get('/:id', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const note = await getNote(id);

    if (!note) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    res.json(note);
  } catch (error) {
    console.error('Error getting note:', error);
    res.status(500).json({ error: 'Failed to get note' });
  }
});

/**
 * PATCH /api/notes/:id
 * Update a note
 */
router.patch('/:id', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const { title, content, primary_entity_id, entity_ids, category, tags, is_pinned, color } = req.body;

    const note = await updateNote(id, {
      title,
      content,
      primary_entity_id,
      entity_ids,
      category,
      tags,
      is_pinned,
      color,
    });

    if (!note) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    res.json(note);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

/**
 * POST /api/notes/:id/archive
 * Archive a note (soft delete)
 */
router.post('/:id/archive', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    await archiveNote(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error archiving note:', error);
    res.status(500).json({ error: 'Failed to archive note' });
  }
});

/**
 * DELETE /api/notes/:id
 * Hard delete a note
 */
router.delete('/:id', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    await deleteNote(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

/**
 * POST /api/notes/:id/pin
 * Pin a note
 */
router.post('/:id/pin', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const note = await pinNote(id);

    if (!note) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    res.json(note);
  } catch (error) {
    console.error('Error pinning note:', error);
    res.status(500).json({ error: 'Failed to pin note' });
  }
});

/**
 * POST /api/notes/:id/unpin
 * Unpin a note
 */
router.post('/:id/unpin', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const note = await unpinNote(id);

    if (!note) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    res.json(note);
  } catch (error) {
    console.error('Error unpinning note:', error);
    res.status(500).json({ error: 'Failed to unpin note' });
  }
});

/**
 * POST /api/notes/:id/link
 * Link a note to an entity
 */
router.post('/:id/link', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const { entity_id, is_primary } = req.body;

    if (!entity_id) {
      res.status(400).json({ error: 'entity_id is required' });
      return;
    }

    const note = await linkNoteToEntity(id, entity_id, is_primary === true);

    if (!note) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    res.json(note);
  } catch (error) {
    console.error('Error linking note to entity:', error);
    res.status(500).json({ error: 'Failed to link note to entity' });
  }
});

/**
 * POST /api/notes/:id/unlink
 * Unlink a note from an entity
 */
router.post('/:id/unlink', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const { entity_id } = req.body;

    if (!entity_id) {
      res.status(400).json({ error: 'entity_id is required' });
      return;
    }

    const note = await unlinkNoteFromEntity(id, entity_id);

    if (!note) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    res.json(note);
  } catch (error) {
    console.error('Error unlinking note from entity:', error);
    res.status(500).json({ error: 'Failed to unlink note from entity' });
  }
});

export default router;
