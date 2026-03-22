import { Router, Request, Response } from 'express';
import { synthesizeSpeech, listVoices, checkHealth } from '../../services/tts.js';

const router = Router();

/**
 * POST /api/tts/synthesize
 * Synthesize speech from text
 *
 * Request body:
 * - text: string (required) - The text to synthesize
 * - voice: string (optional) - The voice to use (defaults to af_bella)
 *
 * Response: audio/mpeg (MP3 audio data)
 */
router.post('/synthesize', async (req: Request, res: Response): Promise<void> => {
  try {
    const { text, voice } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Missing or invalid required field: text' });
      return;
    }

    if (text.trim().length === 0) {
      res.status(400).json({ error: 'Text cannot be empty' });
      return;
    }

    // Synthesize speech
    const audioBuffer = await synthesizeSpeech(text, voice);

    // Return audio as MP3
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', audioBuffer.length.toString());
    res.send(audioBuffer);
  } catch (error) {
    console.error('TTS synthesis error:', error);
    res.status(500).json({
      error: 'Failed to synthesize speech',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/tts/voices
 * List available voices
 *
 * Response: JSON array of voice names
 */
router.get('/voices', async (_req: Request, res: Response): Promise<void> => {
  try {
    const voices = await listVoices();
    res.json({ voices });
  } catch (error) {
    console.error('List voices error:', error);
    res.status(500).json({
      error: 'Failed to list voices',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/tts/health
 * Check TTS service health
 *
 * Response: JSON health status
 */
router.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    const healthy = await checkHealth();
    res.json({
      status: healthy ? 'healthy' : 'unhealthy',
      service: 'kokoro-tts',
    });
  } catch (error) {
    console.error('TTS health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      service: 'kokoro-tts',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
