/**
 * TTS Service
 *
 * Text-to-speech synthesis using Kokoro TTS via OpenAI-compatible API.
 * Kokoro runs locally in Docker on port 8880.
 */

// === TYPES ===

export interface Voice {
  name: string;
}

export interface SynthesizeRequest {
  model: string;
  voice: string;
  input: string;
  response_format: string;
}

// === CONSTANTS ===

const KOKORO_BASE_URL = process.env['KOKORO_BASE_URL'] || 'http://localhost:8880';
const DEFAULT_VOICE = 'am_santa'; // Santa voice

// === MAIN FUNCTIONS ===

/**
 * Synthesize speech from text using Kokoro TTS
 *
 * @param text - The text to synthesize
 * @param voice - The voice to use (defaults to af_bella)
 * @returns Audio data as a Buffer
 */
export async function synthesizeSpeech(text: string, voice: string = DEFAULT_VOICE): Promise<Buffer> {
  const url = `${KOKORO_BASE_URL}/v1/audio/speech`;

  const requestBody: SynthesizeRequest = {
    model: 'kokoro',
    voice,
    input: text,
    response_format: 'mp3',
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`TTS synthesis failed: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('TTS synthesis error:', error);
    throw new Error(`Failed to synthesize speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * List available voices from Kokoro TTS
 *
 * @returns Array of voice names
 */
export async function listVoices(): Promise<string[]> {
  const url = `${KOKORO_BASE_URL}/v1/voices`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch voices: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Kokoro returns an object with voice names as keys
    // Extract the voice names into an array
    if (typeof data === 'object' && data !== null) {
      return Object.keys(data);
    }

    return [];
  } catch (error) {
    console.error('List voices error:', error);
    throw new Error(`Failed to list voices: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if Kokoro TTS service is healthy
 *
 * @returns True if service is healthy, false otherwise
 */
export async function checkHealth(): Promise<boolean> {
  const url = `${KOKORO_BASE_URL}/health`;

  try {
    const response = await fetch(url, {
      method: 'GET',
    });

    return response.ok;
  } catch (error) {
    console.error('TTS health check error:', error);
    return false;
  }
}
