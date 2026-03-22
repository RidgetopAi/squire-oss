import { config } from '../config/index.js';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Ollama embedding provider
 * Uses local Ollama instance with nomic-embed-text or similar model
 */
class OllamaEmbeddingProvider implements EmbeddingProvider {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = config.embedding.ollamaUrl;
    this.model = config.embedding.model;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama embedding failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as { embedding: number[] };
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't have native batch support, so we parallelize
    const results = await Promise.all(texts.map((text) => this.embed(text)));
    return results;
  }
}

// Singleton provider instance
let provider: EmbeddingProvider | null = null;

/**
 * Get the configured embedding provider
 */
function getEmbeddingProvider(): EmbeddingProvider {
  if (!provider) {
    switch (config.embedding.provider) {
      case 'ollama':
        provider = new OllamaEmbeddingProvider();
        break;
      default:
        throw new Error(`Unknown embedding provider: ${config.embedding.provider}`);
    }
  }
  return provider;
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const embedder = getEmbeddingProvider();
  return embedder.embed(text);
}

/**
 * Generate embeddings for multiple texts
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embedder = getEmbeddingProvider();
  return embedder.embedBatch(texts);
}

/**
 * Check if embedding provider is available
 */
export async function checkEmbeddingHealth(): Promise<boolean> {
  try {
    const embedder = getEmbeddingProvider();
    const result = await embedder.embed('health check');
    return result.length === config.embedding.dimension;
  } catch {
    return false;
  }
}
