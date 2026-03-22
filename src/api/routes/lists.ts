import { Router, Request, Response } from 'express';

interface IdParams { id: string }
interface EntityParams { entityId: string }
interface ListItemParams { listId: string; itemId: string }
import {
  createList,
  getList,
  getListWithItems,
  updateList,
  archiveList,
  deleteList,
  listLists,
  searchLists,
  getListsByEntity,
  findListByName,
  addItem,
  getItem,
  updateItem,
  removeItem,
  deleteItem,
  reorderItems,
  toggleItem,
  completeItem,
  uncompleteItem,
  getCompletionStats,
  completeAllItems,
  clearCompletedItems,
  exportList,
  exportAllLists,
  ListType,
  SortType,
} from '../../services/lists.js';

const router = Router();

// =============================================================================
// LIST ROUTES
// =============================================================================

/**
 * GET /api/lists
 * List all lists with optional filters
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const list_type = req.query.list_type as ListType | undefined;
    const category = req.query.category as string | undefined;
    const entity_id = req.query.entity_id as string | undefined;
    const is_pinned = req.query.is_pinned === 'true' ? true : req.query.is_pinned === 'false' ? false : undefined;
    const include_archived = req.query.include_archived === 'true';

    const validListTypes: ListType[] = ['checklist', 'simple', 'ranked'];
    if (list_type && !validListTypes.includes(list_type)) {
      res.status(400).json({ error: `Invalid list_type. Must be one of: ${validListTypes.join(', ')}` });
      return;
    }

    const lists = await listLists({
      limit,
      offset,
      list_type,
      category,
      entity_id,
      is_pinned,
      include_archived,
    });

    res.json({
      lists,
      count: lists.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing lists:', error);
    res.status(500).json({ error: 'Failed to list lists' });
  }
});

/**
 * GET /api/lists/search
 * Search lists semantically
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: 'Query parameter q is required' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const lists = await searchLists(query, limit);

    res.json({
      lists,
      count: lists.length,
      query,
    });
  } catch (error) {
    console.error('Error searching lists:', error);
    res.status(500).json({ error: 'Failed to search lists' });
  }
});

/**
 * GET /api/lists/find
 * Find a list by name (exact or fuzzy match)
 */
router.get('/find', async (req: Request, res: Response): Promise<void> => {
  try {
    const name = req.query.name as string;
    if (!name) {
      res.status(400).json({ error: 'Query parameter name is required' });
      return;
    }

    const list = await findListByName(name);

    if (!list) {
      res.status(404).json({ error: 'List not found' });
      return;
    }

    res.json(list);
  } catch (error) {
    console.error('Error finding list:', error);
    res.status(500).json({ error: 'Failed to find list' });
  }
});

/**
 * GET /api/lists/export
 * Export all lists
 */
router.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const format = (req.query.format as 'json' | 'markdown' | 'csv' | 'txt') || 'json';
    const include_completed = req.query.include_completed !== 'false';
    const only_completed = req.query.only_completed === 'true';
    const include_metadata = req.query.include_metadata === 'true';

    const data = await exportAllLists({
      format,
      include_completed,
      only_completed,
      include_metadata,
    });

    const contentTypes: Record<string, string> = {
      json: 'application/json',
      markdown: 'text/markdown',
      csv: 'text/csv',
      txt: 'text/plain',
    };

    res.setHeader('Content-Type', contentTypes[format] || 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="lists-export.${format === 'markdown' ? 'md' : format}"`);
    res.send(data);
  } catch (error) {
    console.error('Error exporting lists:', error);
    res.status(500).json({ error: 'Failed to export lists' });
  }
});

/**
 * GET /api/lists/entity/:entityId
 * Get all lists for a specific entity
 */
router.get('/entity/:entityId', async (req: Request<EntityParams>, res: Response): Promise<void> => {
  try {
    const entityId = req.params.entityId;
    const lists = await getListsByEntity(entityId);
    res.json({ lists, count: lists.length });
  } catch (error) {
    console.error('Error getting entity lists:', error);
    res.status(500).json({ error: 'Failed to get entity lists' });
  }
});

/**
 * POST /api/lists
 * Create a new list
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      description,
      list_type,
      primary_entity_id,
      category,
      tags,
      is_pinned,
      color,
      default_sort,
    } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const validListTypes: ListType[] = ['checklist', 'simple', 'ranked'];
    if (list_type && !validListTypes.includes(list_type)) {
      res.status(400).json({ error: `Invalid list_type. Must be one of: ${validListTypes.join(', ')}` });
      return;
    }

    const validSortTypes: SortType[] = ['manual', 'created', 'priority', 'due_date'];
    if (default_sort && !validSortTypes.includes(default_sort)) {
      res.status(400).json({ error: `Invalid default_sort. Must be one of: ${validSortTypes.join(', ')}` });
      return;
    }

    const list = await createList({
      name,
      description,
      list_type,
      primary_entity_id,
      category,
      tags,
      is_pinned,
      color,
      default_sort,
    });

    res.status(201).json(list);
  } catch (error) {
    console.error('Error creating list:', error);
    res.status(500).json({ error: 'Failed to create list' });
  }
});

/**
 * GET /api/lists/:id
 * Get a single list by ID (without items)
 */
router.get('/:id', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const withItems = req.query.items === 'true';

    const list = withItems ? await getListWithItems(id) : await getList(id);

    if (!list) {
      res.status(404).json({ error: 'List not found' });
      return;
    }

    res.json(list);
  } catch (error) {
    console.error('Error getting list:', error);
    res.status(500).json({ error: 'Failed to get list' });
  }
});

/**
 * PATCH /api/lists/:id
 * Update a list
 */
router.patch('/:id', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const {
      name,
      description,
      list_type,
      primary_entity_id,
      category,
      tags,
      is_pinned,
      color,
      default_sort,
    } = req.body;

    const validListTypes: ListType[] = ['checklist', 'simple', 'ranked'];
    if (list_type && !validListTypes.includes(list_type)) {
      res.status(400).json({ error: `Invalid list_type. Must be one of: ${validListTypes.join(', ')}` });
      return;
    }

    const validSortTypes: SortType[] = ['manual', 'created', 'priority', 'due_date'];
    if (default_sort && !validSortTypes.includes(default_sort)) {
      res.status(400).json({ error: `Invalid default_sort. Must be one of: ${validSortTypes.join(', ')}` });
      return;
    }

    const list = await updateList(id, {
      name,
      description,
      list_type,
      primary_entity_id,
      category,
      tags,
      is_pinned,
      color,
      default_sort,
    });

    if (!list) {
      res.status(404).json({ error: 'List not found' });
      return;
    }

    res.json(list);
  } catch (error) {
    console.error('Error updating list:', error);
    res.status(500).json({ error: 'Failed to update list' });
  }
});

/**
 * POST /api/lists/:id/archive
 * Archive a list (soft delete)
 */
router.post('/:id/archive', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    await archiveList(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error archiving list:', error);
    res.status(500).json({ error: 'Failed to archive list' });
  }
});

/**
 * DELETE /api/lists/:id
 * Hard delete a list
 */
router.delete('/:id', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    await deleteList(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting list:', error);
    res.status(500).json({ error: 'Failed to delete list' });
  }
});

/**
 * GET /api/lists/:id/stats
 * Get completion stats for a list
 */
router.get('/:id/stats', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const stats = await getCompletionStats(id);
    res.json(stats);
  } catch (error) {
    console.error('Error getting list stats:', error);
    res.status(500).json({ error: 'Failed to get list stats' });
  }
});

/**
 * GET /api/lists/:id/export
 * Export a single list
 */
router.get('/:id/export', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const format = (req.query.format as 'json' | 'markdown' | 'csv' | 'txt') || 'json';
    const include_completed = req.query.include_completed !== 'false';
    const only_completed = req.query.only_completed === 'true';
    const include_metadata = req.query.include_metadata === 'true';

    const data = await exportList(id, {
      format,
      include_completed,
      only_completed,
      include_metadata,
    });

    const contentTypes: Record<string, string> = {
      json: 'application/json',
      markdown: 'text/markdown',
      csv: 'text/csv',
      txt: 'text/plain',
    };

    res.setHeader('Content-Type', contentTypes[format] || 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="list-export.${format === 'markdown' ? 'md' : format}"`);
    res.send(data);
  } catch (error) {
    console.error('Error exporting list:', error);
    res.status(500).json({ error: 'Failed to export list' });
  }
});

/**
 * POST /api/lists/:id/complete-all
 * Complete all items in a list
 */
router.post('/:id/complete-all', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    await completeAllItems(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error completing all items:', error);
    res.status(500).json({ error: 'Failed to complete all items' });
  }
});

/**
 * POST /api/lists/:id/clear-completed
 * Clear (archive) completed items
 */
router.post('/:id/clear-completed', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const count = await clearCompletedItems(id);
    res.json({ cleared: count });
  } catch (error) {
    console.error('Error clearing completed items:', error);
    res.status(500).json({ error: 'Failed to clear completed items' });
  }
});

/**
 * POST /api/lists/:id/reorder
 * Reorder items in a list
 */
router.post('/:id/reorder', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const { item_ids } = req.body;

    if (!item_ids || !Array.isArray(item_ids)) {
      res.status(400).json({ error: 'item_ids array is required' });
      return;
    }

    await reorderItems(id, item_ids);
    res.status(204).send();
  } catch (error) {
    console.error('Error reordering items:', error);
    res.status(500).json({ error: 'Failed to reorder items' });
  }
});

// =============================================================================
// ITEM ROUTES
// =============================================================================

/**
 * POST /api/lists/:id/items
 * Add an item to a list
 */
router.post('/:id/items', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const listId = req.params.id;
    const { content, notes, priority, due_at, entity_id, sort_order } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const list = await getList(listId);
    if (!list) {
      res.status(404).json({ error: 'List not found' });
      return;
    }

    const item = await addItem(listId, {
      content,
      notes,
      priority,
      due_at: due_at ? new Date(due_at) : undefined,
      entity_id,
      sort_order,
    });

    res.status(201).json(item);
  } catch (error) {
    console.error('Error adding item:', error);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

/**
 * GET /api/lists/:listId/items/:itemId
 * Get a single item
 */
router.get('/:listId/items/:itemId', async (req: Request<ListItemParams>, res: Response): Promise<void> => {
  try {
    const itemId = req.params.itemId;
    const item = await getItem(itemId);

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    res.json(item);
  } catch (error) {
    console.error('Error getting item:', error);
    res.status(500).json({ error: 'Failed to get item' });
  }
});

/**
 * PATCH /api/lists/:listId/items/:itemId
 * Update an item
 */
router.patch('/:listId/items/:itemId', async (req: Request<ListItemParams>, res: Response): Promise<void> => {
  try {
    const itemId = req.params.itemId;
    const { content, notes, is_completed, priority, due_at, entity_id, sort_order } = req.body;

    const item = await updateItem(itemId, {
      content,
      notes,
      is_completed,
      priority,
      due_at: due_at !== undefined ? (due_at ? new Date(due_at) : null) : undefined,
      entity_id,
      sort_order,
    });

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    res.json(item);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

/**
 * DELETE /api/lists/:listId/items/:itemId
 * Remove an item (archive)
 */
router.delete('/:listId/items/:itemId', async (req: Request<ListItemParams>, res: Response): Promise<void> => {
  try {
    const itemId = req.params.itemId;
    const hard = req.query.hard === 'true';

    if (hard) {
      await deleteItem(itemId);
    } else {
      await removeItem(itemId);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error removing item:', error);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

/**
 * POST /api/lists/:listId/items/:itemId/toggle
 * Toggle item completion
 */
router.post('/:listId/items/:itemId/toggle', async (req: Request<ListItemParams>, res: Response): Promise<void> => {
  try {
    const itemId = req.params.itemId;
    const item = await toggleItem(itemId);

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    res.json(item);
  } catch (error) {
    console.error('Error toggling item:', error);
    res.status(500).json({ error: 'Failed to toggle item' });
  }
});

/**
 * POST /api/lists/:listId/items/:itemId/complete
 * Mark item as complete
 */
router.post('/:listId/items/:itemId/complete', async (req: Request<ListItemParams>, res: Response): Promise<void> => {
  try {
    const itemId = req.params.itemId;
    const item = await completeItem(itemId);

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    res.json(item);
  } catch (error) {
    console.error('Error completing item:', error);
    res.status(500).json({ error: 'Failed to complete item' });
  }
});

/**
 * POST /api/lists/:listId/items/:itemId/uncomplete
 * Mark item as incomplete
 */
router.post('/:listId/items/:itemId/uncomplete', async (req: Request<ListItemParams>, res: Response): Promise<void> => {
  try {
    const itemId = req.params.itemId;
    const item = await uncompleteItem(itemId);

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    res.json(item);
  } catch (error) {
    console.error('Error uncompleting item:', error);
    res.status(500).json({ error: 'Failed to uncomplete item' });
  }
});

export default router;
