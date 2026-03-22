import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  createObject,
  getObjectById,
  getObjectData,
  listObjects,
  updateObject,
  deleteObject,
  linkToMemory,
  unlinkFromMemory,
  getObjectsForMemory,
  getMemoriesForObject,
  linkToEntity,
  unlinkFromEntity,
  getObjectsForEntity,
  getEntitiesForObject,
  addTag,
  removeTag,
  getObjectTags,
  getAllTags,
  createCollection,
  getCollectionById,
  listCollections,
  addToCollection,
  removeFromCollection,
  getCollectionObjects,
  searchObjectsSemantic,
  getObjectStats,
  generateObjectEmbedding,
  OBJECT_TYPES,
  OBJECT_STATUSES,
  PROCESSING_STATUSES,
  MEMORY_LINK_TYPES,
  ENTITY_LINK_TYPES,
  type ObjectType,
  type ObjectStatus,
  type ProcessingStatus,
  type MemoryLinkType,
  type EntityLinkType,
} from '../../services/objects.js';

const router = Router();

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// ============================================================================
// OBJECT CRUD ENDPOINTS
// ============================================================================

/**
 * GET /api/objects
 * List objects with optional filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const objectType = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const processingStatus = req.query.processingStatus as string | undefined;
    const tag = req.query.tag as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    // Validate type if provided
    if (objectType && !OBJECT_TYPES.includes(objectType as ObjectType)) {
      res.status(400).json({ error: 'Invalid object type', validTypes: OBJECT_TYPES });
      return;
    }

    // Validate status if provided
    if (status && !OBJECT_STATUSES.includes(status as ObjectStatus)) {
      res.status(400).json({ error: 'Invalid status', validStatuses: OBJECT_STATUSES });
      return;
    }

    if (processingStatus && !PROCESSING_STATUSES.includes(processingStatus as ProcessingStatus)) {
      res.status(400).json({ error: 'Invalid processing status', validStatuses: PROCESSING_STATUSES });
      return;
    }

    const objects = await listObjects({
      objectType: objectType as ObjectType | undefined,
      status: (status as ObjectStatus | undefined) || 'active',
      processingStatus: processingStatus as ProcessingStatus | undefined,
      tag,
      search,
      limit,
      offset,
    });

    res.json({ objects, count: objects.length });
  } catch (error) {
    console.error('Failed to list objects:', error);
    res.status(500).json({ error: 'Failed to list objects' });
  }
});

/**
 * GET /api/objects/stats
 * Get object statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getObjectStats();
    res.json({
      stats,
      types: OBJECT_TYPES,
      statuses: OBJECT_STATUSES,
      processingStatuses: PROCESSING_STATUSES,
    });
  } catch (error) {
    console.error('Failed to get object stats:', error);
    res.status(500).json({ error: 'Failed to get object statistics' });
  }
});

/**
 * GET /api/objects/tags
 * Get all unique tags with counts
 */
router.get('/tags', async (_req: Request, res: Response) => {
  try {
    const tags = await getAllTags();
    res.json({ tags, count: tags.length });
  } catch (error) {
    console.error('Failed to get tags:', error);
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

/**
 * GET /api/objects/search
 * Semantic search for objects
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const objectType = req.query.type as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    if (!query) {
      res.status(400).json({ error: 'Query parameter q is required' });
      return;
    }

    if (objectType && !OBJECT_TYPES.includes(objectType as ObjectType)) {
      res.status(400).json({ error: 'Invalid object type', validTypes: OBJECT_TYPES });
      return;
    }

    const objects = await searchObjectsSemantic(query, {
      limit,
      objectType: objectType as ObjectType | undefined,
    });

    res.json({ objects, count: objects.length, query });
  } catch (error) {
    console.error('Failed to search objects:', error);
    res.status(500).json({ error: 'Failed to search objects' });
  }
});

/**
 * GET /api/objects/collections
 * List all collections
 */
router.get('/collections', async (_req: Request, res: Response) => {
  try {
    const collections = await listCollections();
    res.json({ collections, count: collections.length });
  } catch (error) {
    console.error('Failed to list collections:', error);
    res.status(500).json({ error: 'Failed to list collections' });
  }
});

/**
 * POST /api/objects/collections
 * Create a collection
 */
router.post('/collections', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Collection name is required' });
      return;
    }

    const collection = await createCollection(name, description);
    res.status(201).json({ collection });
  } catch (error) {
    console.error('Failed to create collection:', error);
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

/**
 * GET /api/objects/collections/:collectionId
 * Get collection by ID
 */
router.get('/collections/:collectionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { collectionId } = req.params;
    if (!collectionId) {
      res.status(400).json({ error: 'Collection ID required' });
      return;
    }

    const collection = await getCollectionById(collectionId);
    if (!collection) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }

    const objects = await getCollectionObjects(collection.id);
    res.json({ collection, objects, count: objects.length });
  } catch (error) {
    console.error('Failed to get collection:', error);
    res.status(500).json({ error: 'Failed to get collection' });
  }
});

/**
 * POST /api/objects/collections/:collectionId/objects/:objectId
 * Add object to collection
 */
router.post('/collections/:collectionId/objects/:objectId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { collectionId, objectId } = req.params;
    if (!collectionId || !objectId) {
      res.status(400).json({ error: 'Collection ID and Object ID required' });
      return;
    }

    const position = req.body.position ? parseInt(req.body.position, 10) : undefined;
    const added = await addToCollection(collectionId, objectId, position);

    if (!added) {
      res.status(400).json({ error: 'Failed to add to collection' });
      return;
    }

    res.status(201).json({ success: true, message: 'Added to collection' });
  } catch (error) {
    console.error('Failed to add to collection:', error);
    res.status(500).json({ error: 'Failed to add to collection' });
  }
});

/**
 * DELETE /api/objects/collections/:collectionId/objects/:objectId
 * Remove object from collection
 */
router.delete('/collections/:collectionId/objects/:objectId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { collectionId, objectId } = req.params;
    if (!collectionId || !objectId) {
      res.status(400).json({ error: 'Collection ID and Object ID required' });
      return;
    }

    const removed = await removeFromCollection(collectionId, objectId);
    if (!removed) {
      res.status(404).json({ error: 'Object not in collection' });
      return;
    }
    res.json({ success: true, message: 'Removed from collection' });
  } catch (error) {
    console.error('Failed to remove from collection:', error);
    res.status(500).json({ error: 'Failed to remove from collection' });
  }
});

/**
 * GET /api/objects/memory/:memoryId
 * Get objects linked to a specific memory
 */
router.get('/memory/:memoryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { memoryId } = req.params;
    if (!memoryId) {
      res.status(400).json({ error: 'Memory ID required' });
      return;
    }

    const objects = await getObjectsForMemory(memoryId);
    res.json({ objects, count: objects.length });
  } catch (error) {
    console.error('Failed to get objects for memory:', error);
    res.status(500).json({ error: 'Failed to get objects for memory' });
  }
});

/**
 * GET /api/objects/entity/:entityId
 * Get objects linked to a specific entity
 */
router.get('/entity/:entityId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { entityId } = req.params;
    if (!entityId) {
      res.status(400).json({ error: 'Entity ID required' });
      return;
    }

    const objects = await getObjectsForEntity(entityId);
    res.json({ objects, count: objects.length });
  } catch (error) {
    console.error('Failed to get objects for entity:', error);
    res.status(500).json({ error: 'Failed to get objects for entity' });
  }
});

/**
 * POST /api/objects
 * Upload a new object
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const name = (req.body.name as string) || file.originalname;
    const description = req.body.description as string | undefined;
    const tagsStr = req.body.tags as string | undefined;
    const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

    const result = await createObject({
      name,
      filename: file.originalname,
      mimeType: file.mimetype,
      data: file.buffer,
      description,
      source: 'upload',
      tags,
    });

    if (result.isDuplicate) {
      res.status(200).json({
        object: result.object,
        tags: result.tags,
        isDuplicate: true,
        message: 'Object already exists (duplicate detected by hash)',
      });
    } else {
      res.status(201).json({
        object: result.object,
        tags: result.tags,
        isDuplicate: false,
      });
    }
  } catch (error) {
    console.error('Failed to upload object:', error);
    res.status(500).json({ error: 'Failed to upload object' });
  }
});

/**
 * GET /api/objects/:id
 * Get object by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Object ID required' });
      return;
    }

    const object = await getObjectById(id);
    if (!object) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }

    const tags = await getObjectTags(object.id);
    const memoryLinks = await getMemoriesForObject(object.id);
    const entityLinks = await getEntitiesForObject(object.id);

    res.json({ object, tags, memoryLinks, entityLinks });
  } catch (error) {
    console.error('Failed to get object:', error);
    res.status(500).json({ error: 'Failed to get object' });
  }
});

/**
 * GET /api/objects/:id/download
 * Download object file
 */
router.get('/:id/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Object ID required' });
      return;
    }

    const object = await getObjectById(id);
    if (!object || object.status === 'deleted') {
      res.status(404).json({ error: 'Object not found' });
      return;
    }

    const data = await getObjectData(id);
    if (!data) {
      res.status(404).json({ error: 'Object file not found' });
      return;
    }

    res.setHeader('Content-Type', object.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${object.filename}"`);
    res.setHeader('Content-Length', data.length);
    res.send(data);
  } catch (error) {
    console.error('Failed to download object:', error);
    res.status(500).json({ error: 'Failed to download object' });
  }
});

/**
 * PATCH /api/objects/:id
 * Update object metadata
 */
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Object ID required' });
      return;
    }

    const { name, description, metadata, status } = req.body;

    if (status && !OBJECT_STATUSES.includes(status as ObjectStatus)) {
      res.status(400).json({ error: 'Invalid status', validStatuses: OBJECT_STATUSES });
      return;
    }

    const object = await updateObject(id, {
      name,
      description,
      metadata,
      status: status as ObjectStatus | undefined,
    });

    if (!object) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }

    res.json({ object });
  } catch (error) {
    console.error('Failed to update object:', error);
    res.status(500).json({ error: 'Failed to update object' });
  }
});

/**
 * DELETE /api/objects/:id
 * Soft delete an object
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Object ID required' });
      return;
    }

    const deleted = await deleteObject(id);
    if (!deleted) {
      res.status(404).json({ error: 'Object not found or already deleted' });
      return;
    }
    res.json({ success: true, message: 'Object deleted' });
  } catch (error) {
    console.error('Failed to delete object:', error);
    res.status(500).json({ error: 'Failed to delete object' });
  }
});

/**
 * POST /api/objects/:id/embedding
 * Generate embedding for object
 */
router.post('/:id/embedding', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Object ID required' });
      return;
    }

    const success = await generateObjectEmbedding(id);
    if (!success) {
      res.status(400).json({ error: 'Failed to generate embedding (no text content)' });
      return;
    }
    res.json({ success: true, message: 'Embedding generated' });
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    res.status(500).json({ error: 'Failed to generate embedding' });
  }
});

// ============================================================================
// MEMORY LINK ENDPOINTS
// ============================================================================

/**
 * GET /api/objects/:id/memories
 * Get memories linked to an object
 */
router.get('/:id/memories', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Object ID required' });
      return;
    }

    const links = await getMemoriesForObject(id);
    res.json({ links, count: links.length });
  } catch (error) {
    console.error('Failed to get memory links:', error);
    res.status(500).json({ error: 'Failed to get memory links' });
  }
});

/**
 * POST /api/objects/:id/memories/:memoryId
 * Link object to memory
 */
router.post('/:id/memories/:memoryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, memoryId } = req.params;
    if (!id || !memoryId) {
      res.status(400).json({ error: 'Object ID and Memory ID required' });
      return;
    }

    const linkType = (req.body.linkType as string) || 'attachment';
    const relevance = req.body.relevance ? parseFloat(req.body.relevance) : 0.5;
    const notes = req.body.notes as string | undefined;

    if (!MEMORY_LINK_TYPES.includes(linkType as MemoryLinkType)) {
      res.status(400).json({ error: 'Invalid link type', validTypes: MEMORY_LINK_TYPES });
      return;
    }

    const link = await linkToMemory(id, memoryId, linkType as MemoryLinkType, {
      relevance,
      notes,
    });

    res.status(201).json({ link });
  } catch (error) {
    console.error('Failed to link to memory:', error);
    res.status(500).json({ error: 'Failed to link to memory' });
  }
});

/**
 * DELETE /api/objects/:id/memories/:memoryId
 * Unlink object from memory
 */
router.delete('/:id/memories/:memoryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, memoryId } = req.params;
    if (!id || !memoryId) {
      res.status(400).json({ error: 'Object ID and Memory ID required' });
      return;
    }

    const unlinked = await unlinkFromMemory(id, memoryId);
    if (!unlinked) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }
    res.json({ success: true, message: 'Unlinked from memory' });
  } catch (error) {
    console.error('Failed to unlink from memory:', error);
    res.status(500).json({ error: 'Failed to unlink from memory' });
  }
});

// ============================================================================
// ENTITY LINK ENDPOINTS
// ============================================================================

/**
 * GET /api/objects/:id/entities
 * Get entities linked to an object
 */
router.get('/:id/entities', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Object ID required' });
      return;
    }

    const links = await getEntitiesForObject(id);
    res.json({ links, count: links.length });
  } catch (error) {
    console.error('Failed to get entity links:', error);
    res.status(500).json({ error: 'Failed to get entity links' });
  }
});

/**
 * POST /api/objects/:id/entities/:entityId
 * Link object to entity
 */
router.post('/:id/entities/:entityId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, entityId } = req.params;
    if (!id || !entityId) {
      res.status(400).json({ error: 'Object ID and Entity ID required' });
      return;
    }

    const linkType = (req.body.linkType as string) || 'about';
    const confidence = req.body.confidence ? parseFloat(req.body.confidence) : 0.5;
    const notes = req.body.notes as string | undefined;

    if (!ENTITY_LINK_TYPES.includes(linkType as EntityLinkType)) {
      res.status(400).json({ error: 'Invalid link type', validTypes: ENTITY_LINK_TYPES });
      return;
    }

    const link = await linkToEntity(id, entityId, linkType as EntityLinkType, {
      confidence,
      notes,
    });

    res.status(201).json({ link });
  } catch (error) {
    console.error('Failed to link to entity:', error);
    res.status(500).json({ error: 'Failed to link to entity' });
  }
});

/**
 * DELETE /api/objects/:id/entities/:entityId
 * Unlink object from entity
 */
router.delete('/:id/entities/:entityId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, entityId } = req.params;
    if (!id || !entityId) {
      res.status(400).json({ error: 'Object ID and Entity ID required' });
      return;
    }

    const linkType = req.query.linkType as string | undefined;
    const unlinked = await unlinkFromEntity(id, entityId, linkType as EntityLinkType | undefined);
    if (!unlinked) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }
    res.json({ success: true, message: 'Unlinked from entity' });
  } catch (error) {
    console.error('Failed to unlink from entity:', error);
    res.status(500).json({ error: 'Failed to unlink from entity' });
  }
});

// ============================================================================
// TAG ENDPOINTS
// ============================================================================

/**
 * GET /api/objects/:id/tags
 * Get tags for an object
 */
router.get('/:id/tags', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Object ID required' });
      return;
    }

    const tags = await getObjectTags(id);
    res.json({ tags, count: tags.length });
  } catch (error) {
    console.error('Failed to get tags:', error);
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

/**
 * POST /api/objects/:id/tags
 * Add tag to object
 */
router.post('/:id/tags', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Object ID required' });
      return;
    }

    const { tag } = req.body;
    if (!tag || typeof tag !== 'string') {
      res.status(400).json({ error: 'Tag is required' });
      return;
    }

    const result = await addTag(id, tag, 'user');
    if (!result) {
      res.status(400).json({ error: 'Failed to add tag' });
      return;
    }

    res.status(201).json({ tag: result });
  } catch (error) {
    console.error('Failed to add tag:', error);
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

/**
 * DELETE /api/objects/:id/tags/:tag
 * Remove tag from object
 */
router.delete('/:id/tags/:tag', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, tag } = req.params;
    if (!id || !tag) {
      res.status(400).json({ error: 'Object ID and tag required' });
      return;
    }

    const removed = await removeTag(id, tag);
    if (!removed) {
      res.status(404).json({ error: 'Tag not found' });
      return;
    }
    res.json({ success: true, message: 'Tag removed' });
  } catch (error) {
    console.error('Failed to remove tag:', error);
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

export default router;
