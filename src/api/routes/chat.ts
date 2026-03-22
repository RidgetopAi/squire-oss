/**
 * Chat API Routes (P1-T4)
 *
 * POST /api/chat - Send a message and get a response
 * POST /api/chat/simple - Quick chat without memory context
 */

import { Router, Request, Response } from 'express';
import { chat, chatSimple, type ChatMessage, type ChatRequest } from '../../services/chat.js';
import { checkLLMHealth, getLLMInfo, type ImageContent } from '../../providers/llm.js';
import {
  createConversation,
  getConversation,
  listConversations,
  archiveConversation,
  updateConversationTitle,
  getMessages,
  getRecentConversationWithMessages,
} from '../../services/conversations.js';

const router = Router();

// === Request/Response Types ===

interface ChatApiRequest {
  message: string;
  images?: ImageContent[];
  history?: ChatMessage[];
  includeContext?: boolean;
  contextQuery?: string;
  contextProfile?: string;
  maxContextTokens?: number;
}

interface SimpleChatApiRequest {
  message: string;
  history?: ChatMessage[];
}

// === Routes ===

/**
 * POST /api/chat
 * Full-featured chat with memory context
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as ChatApiRequest;

    // Validate request
    if (!body.message || typeof body.message !== 'string') {
      res.status(400).json({ error: 'Message is required and must be a string' });
      return;
    }

    if (body.message.trim().length === 0) {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }

    // Build chat request
    const chatRequest: ChatRequest = {
      message: body.message.trim(),
      images: body.images,
      conversationHistory: body.history ?? [],
      includeContext: body.includeContext !== false, // Default true
      contextQuery: body.contextQuery,
      contextProfile: body.contextProfile,
      maxContextTokens: body.maxContextTokens,
    };

    // Process chat
    const response = await chat(chatRequest);

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Chat error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    // Handle specific errors
    if (message.includes('GROQ_API_KEY')) {
      res.status(503).json({
        success: false,
        error: 'LLM service not configured',
        details: 'GROQ_API_KEY environment variable is not set',
      });
      return;
    }

    if (message.includes('Groq API error')) {
      res.status(502).json({
        success: false,
        error: 'LLM service error',
        details: message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process chat message',
      details: message,
    });
  }
});

/**
 * POST /api/chat/simple
 * Quick chat without memory context
 */
router.post('/simple', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as SimpleChatApiRequest;

    // Validate request
    if (!body.message || typeof body.message !== 'string') {
      res.status(400).json({ error: 'Message is required and must be a string' });
      return;
    }

    if (body.message.trim().length === 0) {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }

    // Process simple chat
    const response = await chatSimple(body.message.trim(), body.history ?? []);

    res.json({
      success: true,
      data: {
        message: response,
        role: 'assistant',
      },
    });
  } catch (error) {
    console.error('Simple chat error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    res.status(500).json({
      success: false,
      error: 'Failed to process chat message',
      details: message,
    });
  }
});

/**
 * GET /api/chat/health
 * Check if chat service is available
 */
router.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [llmHealthy, llmInfo] = await Promise.all([
      checkLLMHealth(),
      Promise.resolve(getLLMInfo()),
    ]);

    res.json({
      success: true,
      data: {
        status: llmHealthy ? 'healthy' : 'unavailable',
        llm: {
          provider: llmInfo.provider,
          model: llmInfo.model,
          configured: llmInfo.configured,
          available: llmHealthy,
        },
      },
    });
  } catch (error) {
    console.error('Chat health check error:', error);

    res.status(500).json({
      success: false,
      error: 'Health check failed',
    });
  }
});

// =============================================
// CONVERSATION PERSISTENCE ROUTES
// =============================================

/**
 * GET /api/chat/conversations
 * List conversations (paginated)
 */
router.get('/conversations', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = (req.query.status as 'active' | 'archived') || 'active';

    const conversations = await listConversations({ limit, offset, status });

    res.json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list conversations',
    });
  }
});

/**
 * GET /api/chat/conversations/recent
 * Get most recent conversation with messages (for page load)
 */
router.get('/conversations/recent', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await getRecentConversationWithMessages();

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get recent conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recent conversation',
    });
  }
});

/**
 * GET /api/chat/conversations/:id
 * Get conversation with messages
 */
router.get('/conversations/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const conversation = await getConversation(req.params.id);

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
      return;
    }

    const messages = await getMessages(conversation.id);

    res.json({
      success: true,
      data: { conversation, messages },
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get conversation',
    });
  }
});

/**
 * POST /api/chat/conversations
 * Create new conversation
 */
router.post('/conversations', async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientId, title } = req.body as { clientId?: string; title?: string };

    const conversation = await createConversation({ clientId, title });

    res.json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create conversation',
    });
  }
});

/**
 * PATCH /api/chat/conversations/:id
 * Update conversation (title, archive)
 */
router.patch('/conversations/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { title, status } = req.body as { title?: string; status?: 'archived' };
    const { id } = req.params;

    if (status === 'archived') {
      await archiveConversation(id);
    }

    if (title) {
      await updateConversationTitle(id, title);
    }

    const conversation = await getConversation(id);

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
      return;
    }

    res.json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update conversation',
    });
  }
});

export default router;
