import { Router, Request, Response } from 'express';
import {
  getAllGaps,
  getGap,
  getGapSources,
  getGapStats,
  dismissGap,
  fillGap,
  partiallyFillGap,
  getAllQuestions,
  getQuestion,
  getQuestionSources,
  getQuestionStats,
  askQuestion,
  answerQuestion,
  dismissQuestion,
  GAP_TYPES,
  GAP_PRIORITIES,
  GAP_STATUSES,
  QUESTION_TYPES,
  QUESTION_STATUSES,
  TIMING_HINTS,
  type GapType,
  type GapPriority,
  type GapStatus,
  type QuestionType,
  type QuestionStatus,
  type TimingHint,
} from '../../services/research.js';

const router = Router();

// ============================================================================
// GAPS ENDPOINTS
// ============================================================================

/**
 * GET /api/research/gaps
 * List all knowledge gaps with optional filters
 */
router.get('/gaps', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const priority = req.query.priority as string | undefined;
    const entityId = req.query.entityId as string | undefined;
    const minSeverity = req.query.minSeverity
      ? parseFloat(req.query.minSeverity as string)
      : undefined;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 50;

    // Validate type if provided
    if (type && !GAP_TYPES.includes(type as GapType)) {
      res.status(400).json({
        error: 'Invalid gap type',
        validTypes: GAP_TYPES,
      });
      return;
    }

    // Validate status if provided
    if (status && !GAP_STATUSES.includes(status as GapStatus)) {
      res.status(400).json({
        error: 'Invalid status',
        validStatuses: GAP_STATUSES,
      });
      return;
    }

    // Validate priority if provided
    if (priority && !GAP_PRIORITIES.includes(priority as GapPriority)) {
      res.status(400).json({
        error: 'Invalid priority',
        validPriorities: GAP_PRIORITIES,
      });
      return;
    }

    const gaps = await getAllGaps({
      type: type as GapType | undefined,
      status: status as GapStatus | undefined,
      priority: priority as GapPriority | undefined,
      entityId,
      minSeverity,
      limit,
    });

    res.json({ gaps, count: gaps.length });
  } catch (error) {
    console.error('Failed to list gaps:', error);
    res.status(500).json({ error: 'Failed to list knowledge gaps' });
  }
});

/**
 * GET /api/research/gaps/stats
 * Get gap statistics
 */
router.get('/gaps/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getGapStats();
    res.json({
      stats,
      types: GAP_TYPES,
      priorities: GAP_PRIORITIES,
      statuses: GAP_STATUSES,
    });
  } catch (error) {
    console.error('Failed to get gap stats:', error);
    res.status(500).json({ error: 'Failed to get gap statistics' });
  }
});

/**
 * GET /api/research/gaps/type/:type
 * Get gaps by type
 */
router.get('/gaps/type/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type } = req.params;

    if (!type || !GAP_TYPES.includes(type as GapType)) {
      res.status(400).json({
        error: 'Invalid gap type',
        validTypes: GAP_TYPES,
      });
      return;
    }

    const gaps = await getAllGaps({ type: type as GapType });
    res.json({ gaps, count: gaps.length });
  } catch (error) {
    console.error('Failed to get gaps by type:', error);
    res.status(500).json({ error: 'Failed to get gaps by type' });
  }
});

/**
 * GET /api/research/gaps/:id
 * Get a specific gap by ID
 */
router.get('/gaps/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Gap ID required' });
      return;
    }

    const gap = await getGap(id);
    if (!gap) {
      res.status(404).json({ error: 'Gap not found' });
      return;
    }

    res.json({ gap });
  } catch (error) {
    console.error('Failed to get gap:', error);
    res.status(500).json({ error: 'Failed to get gap' });
  }
});

/**
 * GET /api/research/gaps/:id/sources
 * Get sources that revealed this gap
 */
router.get('/gaps/:id/sources', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Gap ID required' });
      return;
    }

    const gap = await getGap(id);
    if (!gap) {
      res.status(404).json({ error: 'Gap not found' });
      return;
    }

    const sources = await getGapSources(id);
    res.json({ gap, sources, count: sources.length });
  } catch (error) {
    console.error('Failed to get gap sources:', error);
    res.status(500).json({ error: 'Failed to get gap sources' });
  }
});

/**
 * POST /api/research/gaps/:id/dismiss
 * Dismiss a gap (not relevant or don't want to know)
 */
router.post('/gaps/:id/dismiss', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Gap ID required' });
      return;
    }

    const reason = req.body.reason as string | undefined;

    const gap = await dismissGap(id, reason);
    res.json({ gap, message: 'Gap dismissed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Failed to dismiss gap:', error);
    res.status(500).json({ error: 'Failed to dismiss gap' });
  }
});

/**
 * POST /api/research/gaps/:id/fill
 * Mark a gap as filled
 */
router.post('/gaps/:id/fill', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Gap ID required' });
      return;
    }

    const gap = await fillGap(id);
    res.json({ gap, message: 'Gap marked as filled' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Failed to fill gap:', error);
    res.status(500).json({ error: 'Failed to fill gap' });
  }
});

/**
 * POST /api/research/gaps/:id/partial
 * Mark a gap as partially filled
 */
router.post('/gaps/:id/partial', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Gap ID required' });
      return;
    }

    const gap = await partiallyFillGap(id);
    res.json({ gap, message: 'Gap marked as partially filled' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Failed to partially fill gap:', error);
    res.status(500).json({ error: 'Failed to partially fill gap' });
  }
});

// ============================================================================
// QUESTIONS ENDPOINTS
// ============================================================================

/**
 * GET /api/research/questions
 * List all research questions with optional filters
 */
router.get('/questions', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const priority = req.query.priority as string | undefined;
    const gapId = req.query.gapId as string | undefined;
    const entityId = req.query.entityId as string | undefined;
    const timingHint = req.query.timing as string | undefined;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 50;

    // Validate type if provided
    if (type && !QUESTION_TYPES.includes(type as QuestionType)) {
      res.status(400).json({
        error: 'Invalid question type',
        validTypes: QUESTION_TYPES,
      });
      return;
    }

    // Validate status if provided
    if (status && !QUESTION_STATUSES.includes(status as QuestionStatus)) {
      res.status(400).json({
        error: 'Invalid status',
        validStatuses: QUESTION_STATUSES,
      });
      return;
    }

    // Validate priority if provided
    if (priority && !GAP_PRIORITIES.includes(priority as GapPriority)) {
      res.status(400).json({
        error: 'Invalid priority',
        validPriorities: GAP_PRIORITIES,
      });
      return;
    }

    // Validate timing hint if provided
    if (timingHint && !TIMING_HINTS.includes(timingHint as TimingHint)) {
      res.status(400).json({
        error: 'Invalid timing hint',
        validHints: TIMING_HINTS,
      });
      return;
    }

    const questions = await getAllQuestions({
      type: type as QuestionType | undefined,
      status: status as QuestionStatus | undefined,
      priority: priority as GapPriority | undefined,
      gapId,
      entityId,
      timingHint: timingHint as TimingHint | undefined,
      limit,
    });

    res.json({ questions, count: questions.length });
  } catch (error) {
    console.error('Failed to list questions:', error);
    res.status(500).json({ error: 'Failed to list research questions' });
  }
});

/**
 * GET /api/research/questions/stats
 * Get question statistics
 */
router.get('/questions/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getQuestionStats();
    res.json({
      stats,
      types: QUESTION_TYPES,
      priorities: GAP_PRIORITIES,
      statuses: QUESTION_STATUSES,
      timingHints: TIMING_HINTS,
    });
  } catch (error) {
    console.error('Failed to get question stats:', error);
    res.status(500).json({ error: 'Failed to get question statistics' });
  }
});

/**
 * GET /api/research/questions/type/:type
 * Get questions by type
 */
router.get('/questions/type/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type } = req.params;

    if (!type || !QUESTION_TYPES.includes(type as QuestionType)) {
      res.status(400).json({
        error: 'Invalid question type',
        validTypes: QUESTION_TYPES,
      });
      return;
    }

    const questions = await getAllQuestions({ type: type as QuestionType });
    res.json({ questions, count: questions.length });
  } catch (error) {
    console.error('Failed to get questions by type:', error);
    res.status(500).json({ error: 'Failed to get questions by type' });
  }
});

/**
 * GET /api/research/questions/timing/:hint
 * Get questions by timing hint
 */
router.get('/questions/timing/:hint', async (req: Request, res: Response): Promise<void> => {
  try {
    const { hint } = req.params;

    if (!hint || !TIMING_HINTS.includes(hint as TimingHint)) {
      res.status(400).json({
        error: 'Invalid timing hint',
        validHints: TIMING_HINTS,
      });
      return;
    }

    const questions = await getAllQuestions({ timingHint: hint as TimingHint });
    res.json({ questions, count: questions.length });
  } catch (error) {
    console.error('Failed to get questions by timing:', error);
    res.status(500).json({ error: 'Failed to get questions by timing' });
  }
});

/**
 * GET /api/research/questions/:id
 * Get a specific question by ID
 */
router.get('/questions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Question ID required' });
      return;
    }

    const question = await getQuestion(id);
    if (!question) {
      res.status(404).json({ error: 'Question not found' });
      return;
    }

    res.json({ question });
  } catch (error) {
    console.error('Failed to get question:', error);
    res.status(500).json({ error: 'Failed to get question' });
  }
});

/**
 * GET /api/research/questions/:id/sources
 * Get sources that prompted this question
 */
router.get('/questions/:id/sources', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Question ID required' });
      return;
    }

    const question = await getQuestion(id);
    if (!question) {
      res.status(404).json({ error: 'Question not found' });
      return;
    }

    const sources = await getQuestionSources(id);
    res.json({ question, sources, count: sources.length });
  } catch (error) {
    console.error('Failed to get question sources:', error);
    res.status(500).json({ error: 'Failed to get question sources' });
  }
});

/**
 * POST /api/research/questions/:id/ask
 * Mark a question as asked
 */
router.post('/questions/:id/ask', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Question ID required' });
      return;
    }

    const question = await askQuestion(id);
    res.json({ question, message: 'Question marked as asked' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Failed to mark question as asked:', error);
    res.status(500).json({ error: 'Failed to mark question as asked' });
  }
});

/**
 * POST /api/research/questions/:id/answer
 * Record an answer to a question
 */
router.post('/questions/:id/answer', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Question ID required' });
      return;
    }

    const { answer, memoryId, usefulness } = req.body as {
      answer?: string;
      memoryId?: string;
      usefulness?: number;
    };

    if (!answer) {
      res.status(400).json({ error: 'Answer is required' });
      return;
    }

    const question = await answerQuestion(id, answer, memoryId, usefulness);
    res.json({ question, message: 'Answer recorded' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Failed to record answer:', error);
    res.status(500).json({ error: 'Failed to record answer' });
  }
});

/**
 * POST /api/research/questions/:id/dismiss
 * Dismiss a question (don't want to answer)
 */
router.post('/questions/:id/dismiss', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Question ID required' });
      return;
    }

    const question = await dismissQuestion(id);
    res.json({ question, message: 'Question dismissed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Failed to dismiss question:', error);
    res.status(500).json({ error: 'Failed to dismiss question' });
  }
});

// ============================================================================
// COMBINED STATISTICS
// ============================================================================

/**
 * GET /api/research/stats
 * Get combined research statistics (gaps + questions)
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [gapStats, questionStats] = await Promise.all([
      getGapStats(),
      getQuestionStats(),
    ]);

    res.json({
      gaps: gapStats,
      questions: questionStats,
      gapTypes: GAP_TYPES,
      questionTypes: QUESTION_TYPES,
    });
  } catch (error) {
    console.error('Failed to get research stats:', error);
    res.status(500).json({ error: 'Failed to get research statistics' });
  }
});

export default router;
